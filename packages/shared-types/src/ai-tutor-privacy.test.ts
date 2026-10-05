import { describe, expect, it } from "vitest";
import {
  AI_TUTOR_FORBIDDEN_PROVIDER_ENV,
  AI_TUTOR_LOG_FORBIDDEN_FIELDS,
  AI_TUTOR_PRIVACY_MODEL_VERSION,
  TUTOR_REDACTION_MARKER,
  TUTOR_SECRET_PATTERNS,
  containsForbiddenLogField,
  describeTutorSecretBlocked,
  projectTutorOutcomeForLog,
  projectTutorRequestForLog,
  redactTutorText,
  screenTutorTextForSecrets,
  screenTutorTextsForSecrets
} from "./ai-tutor-privacy";

/**
 * Privacy, screening, redaction and log safety.
 *
 * ## Why every fixture is assembled rather than written out
 *
 * `scripts/security-scan.sh` scans every tracked file for committed credential
 * shapes. A test that wrote a realistic key as a literal would trip the scanner
 * it exists to support, so each fixture is composed at runtime from parts that
 * are individually harmless. The assembled STRING is a faithful credential
 * shape; the SOURCE contains no line that looks like one.
 *
 * This is not a weakening of the evidence. The detector sees exactly the string
 * a learner would paste.
 */

const FAKE_PROVIDER_KEY = ["sk", "a".repeat(32)].join("-");
const FAKE_CLOUD_KEY = ["AKIA", "ABCDEFGHIJKLMNOP"].join("");
const FAKE_PRIVATE_KEY = `${"-".repeat(5)}BEGIN RSA PRIVATE KEY${"-".repeat(5)}`;
const FAKE_SOURCE_TOKEN = ["ghp", "b".repeat(36)].join("_");
const FAKE_SIGNED_TOKEN = ["eyJhbGciOiJIUzI1NiJ9", "c".repeat(20), "d".repeat(20)].join(".");
const FAKE_BEARER = `Bearer ${"e".repeat(40)}`;
const FAKE_CONNECTION_STRING = "postgresql://appuser:hunter2hunter2@db.internal:5432/app";

describe("credential shapes are recognised deterministically", () => {
  it("stamps the model version", () => {
    expect(AI_TUTOR_PRIVACY_MODEL_VERSION).toBe("ai-tutor-privacy-v1");
  });

  const cases: ReadonlyArray<[string, string, string]> = [
    ["a provider api key", FAKE_PROVIDER_KEY, "provider api key"],
    ["a cloud access key", FAKE_CLOUD_KEY, "cloud access key"],
    ["a private key header", FAKE_PRIVATE_KEY, "private key"],
    ["a source control token", FAKE_SOURCE_TOKEN, "source control token"],
    ["a signed token", FAKE_SIGNED_TOKEN, "signed token"],
    ["a bearer token", FAKE_BEARER, "bearer token"],
    [
      "a connection string credential",
      FAKE_CONNECTION_STRING,
      "connection string credential"
    ]
  ];

  for (const [label, fixture, expectedLabel] of cases) {
    it(`detects ${label}`, () => {
      const screening = screenTutorTextForSecrets(
        `Why does this fail? I used ${fixture} in the config.`
      );

      expect(screening.detected).toBe(true);
      expect(screening.labels).toContain(expectedLabel);
    });
  }

  it("detects a password assignment", () => {
    const screening = screenTutorTextForSecrets("password=Tr0ub4dor&3");

    expect(screening.detected).toBe(true);
    expect(screening.labels).toContain("password");
  });

  it("detects an api key assignment regardless of spelling", () => {
    for (const spelling of ["api_key", "api-key", "apikey", "access_token"]) {
      const screening = screenTutorTextForSecrets(
        `${spelling}: ${"f".repeat(24)}`
      );

      expect(screening.detected).toBe(true);
    }
  });

  it("detects a bare credential assignment with a long opaque value", () => {
    const screening = screenTutorTextForSecrets(`token: ${"g".repeat(30)}`);

    expect(screening.detected).toBe(true);
    expect(screening.labels).toContain("credential assignment");
  });

  /**
   * The 16-character floor, asserted from the other side. A short technical
   * value after an assignment is legitimate content the platform teaches, and
   * refusing it would make the Tutor unusable for exactly the subject matter it
   * supports.
   */
  it("leaves a short technical value after an assignment alone", () => {
    for (const benign of [
      "explain this key: 0x1A2B",
      "the token: ABC123",
      "set key = eth0"
    ]) {
      expect(screenTutorTextForSecrets(benign).detected).toBe(false);
    }
  });

  /**
   * The screening must never return the matched text. If it did, the one value
   * the platform refused to transmit would travel back out through an error
   * message or a log line.
   */
  it("returns kinds and never the matched value", () => {
    const screening = screenTutorTextForSecrets(FAKE_PROVIDER_KEY);

    expect(JSON.stringify(screening)).not.toContain(FAKE_PROVIDER_KEY);
    expect(JSON.stringify(screening)).not.toContain("a".repeat(32));
  });

  it("reports every distinct kind across several texts, without duplicates", () => {
    const screening = screenTutorTextsForSecrets([
      FAKE_PROVIDER_KEY,
      FAKE_PROVIDER_KEY,
      FAKE_CLOUD_KEY
    ]);

    expect([...screening.labels].sort()).toEqual([
      "cloud access key",
      "provider api key"
    ]);
    expect(new Set(screening.labels).size).toBe(screening.labels.length);
  });

  it("leaves ordinary technical questions alone", () => {
    for (const benign of [
      "Why does my VLAN 20 interface stay down?",
      "What does Get-ADUser -Filter * actually return?",
      "Explain index=botsv3 in this search.",
      "kubectl get pods shows CrashLoopBackOff, what does that mean?",
      "My password reset email never arrived."
    ]) {
      expect(screenTutorTextForSecrets(benign).detected).toBe(false);
    }
  });

  it("treats a non-string input as text rather than throwing", () => {
    expect(screenTutorTextForSecrets(undefined).detected).toBe(false);
    expect(screenTutorTextForSecrets(null).detected).toBe(false);
    expect(screenTutorTextForSecrets(42).detected).toBe(false);
  });

  /**
   * The patterns carry no `g` flag, so `lastIndex` cannot persist between
   * calls. This asserts the consequence rather than the cause: the same input
   * screened twice must give the same answer.
   */
  it("is stable across repeated calls", () => {
    for (const { pattern } of TUTOR_SECRET_PATTERNS) {
      expect(pattern.flags).not.toContain("g");
    }

    const first = screenTutorTextForSecrets(FAKE_PROVIDER_KEY);
    const second = screenTutorTextForSecrets(FAKE_PROVIDER_KEY);

    expect(second).toEqual(first);
  });
});

describe("redaction masks without revealing", () => {
  it("replaces the credential with a fixed marker", () => {
    const redacted = redactTutorText(`key is ${FAKE_PROVIDER_KEY} ok`);

    expect(redacted).toContain(TUTOR_REDACTION_MARKER);
    expect(redacted).not.toContain(FAKE_PROVIDER_KEY);
  });

  it("replaces every occurrence, not only the first", () => {
    const redacted = redactTutorText(
      `${FAKE_CLOUD_KEY} and also ${FAKE_CLOUD_KEY}`
    );

    expect(redacted).not.toContain(FAKE_CLOUD_KEY);
    expect(redacted.match(/\[REDACTED\]/g)).toHaveLength(2);
  });

  it("reveals neither the kind nor the length", () => {
    const redacted = redactTutorText(FAKE_PROVIDER_KEY);

    expect(redacted).toBe(TUTOR_REDACTION_MARKER);
  });

  it("leaves surrounding prose intact", () => {
    const redacted = redactTutorText(
      `My VLAN is down and ${FAKE_CLOUD_KEY} is in the file.`
    );

    expect(redacted).toContain("My VLAN is down and");
    expect(redacted).toContain("is in the file.");
  });

  it("changes nothing in a clean question", () => {
    const clean = "Why does trunking fail between the switch and the router?";
    expect(redactTutorText(clean)).toBe(clean);
  });
});

describe("the learner is told what was blocked, never shown it again", () => {
  it("names the kind and states that nothing was sent", () => {
    const message = describeTutorSecretBlocked(["provider api key"]);

    expect(message).toContain("provider api key");
    expect(message).toContain("not sent");
    expect(message).toContain("nothing was stored");
  });

  it("tells the learner what to do instead", () => {
    expect(describeTutorSecretBlocked(["password"]).toLowerCase()).toContain(
      "remove that value"
    );
  });

  it("stays meaningful when no kind was identified", () => {
    expect(describeTutorSecretBlocked([])).toContain("credential");
  });

  /**
   * Section 11 of AIGW-005: the warning must not rely on colour and must not
   * expose the secret again. The message is text only, and the caller never
   * passes it a value — only labels.
   */
  it("carries the whole message in text alone", () => {
    const message = describeTutorSecretBlocked(["signed token"]);

    expect(message).not.toMatch(/#[0-9a-f]{3,6}/i);
    expect(message).not.toMatch(/\b(red|green|amber|yellow)\b/i);
    expect(message).not.toMatch(/[<>]/);
    expect(message.split(". ").length).toBeGreaterThan(1);
  });
});

describe("a routine log carries operations, never learner prose", () => {
  const request = {
    contractVersion: "ai-tutor-request-v1",
    requestId: "req-1",
    correlationId: "corr-1",
    callingEngine: "learning",
    taskType: "explain_concept",
    privacyClass: "learner_private_content"
  };

  it("projects only operational metadata", () => {
    const projection = projectTutorRequestForLog({
      request,
      questionLength: 64,
      noteExcerptCount: 2,
      groundingRefCount: 3,
      labStateAvailability: "unavailable",
      explanationDepth: "concise",
      languageRegister: "default"
    });

    expect(projection).toEqual({
      contractVersion: "ai-tutor-request-v1",
      requestId: "req-1",
      correlationId: "corr-1",
      callingEngine: "learning",
      taskType: "explain_concept",
      privacyClass: "learner_private_content",
      questionLength: 64,
      noteExcerptCount: 2,
      groundingRefCount: 3,
      labStateAvailability: "unavailable",
      explanationDepth: "concise",
      languageRegister: "default"
    });
    expect(containsForbiddenLogField(projection)).toBe(false);
  });

  /**
   * The projection is assembled field by field, never spread. This asserts the
   * consequence: a request carrying extra fields — including the question and a
   * private note excerpt — projects none of them.
   */
  it("drops a field the request carries but the projection does not name", () => {
    const widened = {
      ...request,
      question: `secret inside ${FAKE_PROVIDER_KEY}`,
      noteExcerpts: [{ noteId: "n1", excerpt: "my private note" }],
      userId: "learner-1"
    };

    const projection = projectTutorRequestForLog({
      request: widened,
      questionLength: 10,
      noteExcerptCount: 1,
      groundingRefCount: 0,
      labStateAvailability: "unavailable",
      explanationDepth: "concise",
      languageRegister: "default"
    });

    const serialized = JSON.stringify(projection);

    expect(serialized).not.toContain(FAKE_PROVIDER_KEY);
    expect(serialized).not.toContain("my private note");
    expect(serialized).not.toContain("learner-1");
    // `questionLength` is present and correct; the question itself is not a key.
    expect(Object.keys(projection)).not.toContain("question");
    expect(Object.keys(projection)).not.toContain("noteExcerpts");
    expect(Object.keys(projection)).not.toContain("userId");
  });

  it("projects an outcome without the answer text", () => {
    const projection = projectTutorOutcomeForLog({
      requestId: "req-1",
      correlationId: "corr-1",
      providerId: "local-deterministic",
      outcome: "answered",
      groundingMode: "lesson_grounded",
      citationCount: 2,
      attempts: 1,
      latencyMs: 12,
      answerLength: 88
    });

    expect(containsForbiddenLogField(projection)).toBe(false);
    expect(Object.keys(projection)).not.toContain("answer");
    expect(projection.answerLength).toBe(88);
  });

  it("holds the log prohibition as data", () => {
    for (const field of [
      "question",
      "prompt",
      "answer",
      "noteExcerpts",
      "apiKey",
      "accessToken",
      "userId"
    ]) {
      expect(AI_TUTOR_LOG_FORBIDDEN_FIELDS).toContain(field);
    }
  });

  it("detects a prohibited field at any depth", () => {
    expect(containsForbiddenLogField({ detail: { question: "x" } })).toBe(true);
    expect(containsForbiddenLogField([{ answer: "x" }])).toBe(true);
    expect(containsForbiddenLogField({ QUESTION: "x" })).toBe(true);
    expect(containsForbiddenLogField({ questionLength: 4 })).toBe(false);
  });
});

describe("no paid provider credential is consulted", () => {
  it("names the environment variables this package refuses to read", () => {
    for (const name of [
      "OPENAI_API_KEY",
      "ANTHROPIC_API_KEY",
      "SUPABASE_SERVICE_ROLE_KEY"
    ]) {
      expect(AI_TUTOR_FORBIDDEN_PROVIDER_ENV).toContain(name);
    }
  });
});
