# CURR-012 — Practical Networking Learning-Path Architecture

- **Feature ID:** CURR-012
- **Feature Name:** Practical Networking Learning-Path Architecture
- **Feature Level:** Level 1 — Core
- **Lifecycle Status:** Specified
- **Owning Platform Engine:** Curriculum Engine
- **Governing Company Operating System:** Learning Operating System
- **Product Owner:** Founder

---

# 1. Feature Summary

The networking learning path spans **two courses**, not one. This document is the
single canonical owner of the boundary between them, of the scope each course
holds, and of the practical doctrine — evidence, assistance gradient,
configuration persistence — that governs the hands-on portions of both.

It records **architecture and scope only**. It authors no learner-facing
curriculum, specifies no lesson, and authorizes no implementation.

# 2. Problem Statement

Networking Foundations was authored as eight conceptual missions. Router-on-a-
Stick was authored as the practical course above it. Neither document said where
one ends and the other begins once Networking Foundations grows a hands-on
portion, and DEC-062 requires that it grow one.

Without a recorded boundary, three failures follow. Competency ownership drifts
between the two courses. The practical work lands wherever it is authored rather
than where the learner needs it. And a later authoring pass has to re-derive the
scope decision from a review conversation instead of reading it.

# 3. Student Value

The learner meets a single coherent progression rather than two courses that
overlap or contradict each other. Course 01 leaves them able to operate a device
and prove a bounded state. Course 02 begins above that floor and never re-teaches
it.

# 4. Founder Value

The scope of every future networking work package is decided in advance and in
one place. A reviewer can answer "does this belong in Foundations or in
Router-on-a-Stick?" without a judgement call.

# 5. Included Scope

- The two-course learning path and the boundary between the courses.
- The stage/area scope each course owns.
- The two-site target topology, as an architectural target.
- Evidence-command doctrine for practical networking.
- The assistance gradient for practical instruction.
- Topic scope decisions: OSPF boundaries, services, IPv6, STP, ACL, NAT/PAT.
- The configuration-persistence competency, as curriculum doctrine.

# 6. Explicitly Excluded Scope

- Learner-facing curriculum of any kind.
- Mission definitions, lesson prose, questions, answers, lab instructions.
- Terminal or command-execution implementation.
- Proxmox automation.
- Deterministic validator implementation.
- Selection of a network operating system.
- Any change to the existing Router-on-a-Stick curriculum, competencies or gates.

Nothing in this document authorizes implementation. Each area below is built
under its own approved work package.

# 7. The Two-Course Learning Path

Approved by the DEC-053 amendment. **Both courses remain.** Router-on-a-Stick is
neither merged nor retired, and its existing competency ownership is unchanged.

| Course | Identity | Role |
|---|---|---|
| **01** | Networking Foundations | Establishes the conceptual and operational floor |
| **02** | Router-on-a-Stick / Build the Network | Begins above that floor; owns practical network construction |

**Combined progression:**

```
COURSE 01 — NETWORKING FOUNDATIONS
  UNDERSTAND → OPERATE → ADDRESS → VERIFY → SAVE → PROVE FOUNDATIONAL STATE

COURSE 02 — ROUTER-ON-A-STICK / BUILD THE NETWORK
  BUILD → SEGMENT → TRUNK → ROUTE → MANAGE → SERVE → REBUILD
        → CONNECT → OSPF → TROUBLESHOOT → SAVE → PROVE THE NETWORK
```

# 8. Course 01 — Networking Foundations

Course 01 establishes the floor. A learner completing it can **understand,
operate, inspect, address, verify, save and prove** a small foundational network
or device state.

## 8.1 Stage A — Understand the network

The existing conceptual Missions 1–8, unchanged by this document. It establishes
topology, hosts, interfaces and ports, switches, routers, MAC address, frame,
IPv4 address, prefix and network membership, local versus remote destination,
ARP and broadcast at the already-approved scope, default gateway, packet, the
routing concept, Layer 2 and Layer 3 at the approved scope, connectivity
verification, evidence, failed-result reasoning and initial troubleshooting
reasoning.

The Founder-UAT and technical-writing repair of Stage A proceeds separately and
is not governed here.

## 8.2 Stage B — Operate network devices

Real learner command entry is **required**. Displayed authored output is not
sufficient (DEC-062).

Competency scope: network-device CLI orientation · user EXEC versus privileged
EXEC · entering privileged mode · entering configuration mode · configuration
submodes · leaving a mode · context-sensitive help where the platform supports it
· inspection commands · running configuration · startup configuration · interface
state · configuration persistence · saving configuration.

**Expressed NOS-neutrally.** Representative Cisco-style operations —
`enable`, `configure terminal`, `show running-config`, `show startup-config`,
`show ip interface brief`, `copy running-config startup-config` — are
illustrative of the competency, not the definition of it. The approved lab NOS is
chosen under its own work package, and syntax is not frozen here.

## 8.3 Stage C — Address and verify the network

Competency scope: practical IPv4 addressing · prefix and mask · network
membership · usable host addresses · default gateway · practical CIDR reasoning ·
enough subnetting to support later VLAN networks and a router-to-router transit
network · interface and host addressing where appropriate · inspecting the
resulting state · testing required behaviour · interpreting evidence · saving
required persistent configuration.

**This must not become an excessive binary-math course.** The goal is practical
addressing competence sufficient to build the Course 02 labs.

## 8.4 Course 01 practical completion standard

Course 01 **may not receive final instructional approval while it remains
entirely read-only.** Its practical portion must include genuine learner command
entry and bounded configuration, and the learner must demonstrate at least:

1. navigate the device CLI;
2. inspect device and interface state;
3. make an approved bounded configuration change;
4. verify that change;
5. run an appropriate connectivity or evidence test;
6. save the required persistent configuration;
7. verify the saved state;
8. pass deterministic validation.

This is the Course 01 expression of DEC-062, which is unchanged.

## 8.5 What Course 01 does not own

VLAN segmentation · trunking · 802.1Q · Router-on-a-Stick configuration ·
multi-VLAN inter-VLAN routing · two-site OSPF.

Those sit above the Course 01 floor and belong to Course 02.

# 9. Course 02 — Router-on-a-Stick / Build the Network

Course 02 begins above the floor Course 01 establishes and owns practical network
construction and integration.

**Existing work is preserved and extended, never retired.** The authored course,
its four modules, its seven missions, its competencies — including
`net.vlan-segmentation`, `net.access-port-membership`, `net.trunking-dot1q`,
`net.inter-vlan-routing` and `net.fault-isolation` — and its verifier gates all
remain. Future expansion builds from them.

## 9.1 Approved expansion areas

| Area | Competency scope |
|---|---|
| **A. Build the LAN** | hostname · interface selection · descriptions · shutdown and no shutdown · interface state · MAC address-table inspection · VLAN creation · access-port assignment · VLAN verification · foundational CDP/LLDP · foundational STP awareness and inspection |
| **B. Trunks and ROAS — Site A** | trunk configuration · trunk verification · VLAN membership · 802.1Q concept · router subinterfaces · VLAN gateway addressing · inter-VLAN routing · first complete Router-on-a-Stick site · targeted verification · targeted troubleshooting |
| **C. Device management and secure access** | management SVI · management IPv4 address · Layer-2 switch default gateway where appropriate · local administrative user · enable secret · SSH · VTY and login-local concepts · cryptographic key and domain prerequisites where the NOS requires them · remote-management verification · basic unused-interface hardening awareness |
| **D. Essential network services** | DHCP · DNS · NTP · syslog · configuration transfer — see §11 |
| **E. ROAS — Site B** | the same construction pattern with substantially less guidance; transfer rather than repetition |
| **F. Connect the two sites** | router-to-router interface configuration · transit-network addressing · an appropriately small transit prefix · interface-state verification · routing-table reading · basic static routing · end-to-end verification |
| **G. OSPF fundamentals** | see §10 |
| **H. Operational networking** | ACL · NAT/PAT · STP · CDP/LLDP · NTP and syslog · IPv6 awareness — see §12 |
| **I. Troubleshoot and prove** | progressively seeded faults — see §13 |

**SSH is the preferred remote-management protocol.** Telnet must not be
structured as the preferred solution.

**Static routing is taught before OSPF.** The instructional purpose is that the
learner first experiences Router-1 not knowing the networks behind Router-2, and
solves it manually. That experience is what creates the reason for dynamic
routing.

## 9.2 Capstone

The final practical challenge requires the learner to substantially build both
sites, create VLANs, assign access ports, create trunks, configure both ROAS
routers, address the VLAN gateways, configure the transit link, establish the
required routing and foundational OSPF, establish required management access,
configure and use the required foundational services, inspect state with
appropriate evidence commands, verify local and remote connectivity, diagnose
seeded faults, repair them, save the configuration, verify the saved
configuration, and pass deterministic validation.

**The learner receives requirements, not a command recipe.**

# 10. Two-site target and OSPF boundary

## 10.1 Target topology

Architectural target. Not implemented, and not authored as curriculum.

```
SITE A                                    SITE B

PC-A — VLAN 10                            PC-C — VLAN 30
PC-B — VLAN 20                            PC-D — VLAN 40
        |                                         |
     Switch-1                                  Switch-2
        |                                         |
       trunk                                     trunk
        |                                         |
     Router-1 ——— routed transit network ——— Router-2
```

Router-1 and Router-2 exchange the remote-site routes using foundational
single-area OSPF, Area 0.

The completed learner can reason through and verify a path such as: PC-A →
Switch-1 access port → VLAN 10 → trunk → Router-1 VLAN subinterface → Router-1
routing decision → transit network → Router-2 → Router-2 destination-VLAN
subinterface → trunk → Switch-2 → PC-D.

## 10.2 OSPF — included

Explain why dynamic routing is useful · establish OSPF between Router-1 and
Router-2 · single Area 0 · router ID understood operationally · participate in
and advertise the required networks · establish neighbour adjacency · identify
OSPF-learned routes · interpret next-hop information at a practical level · prove
end-to-end remote-site reachability · troubleshoot a bounded set of realistic
faults.

## 10.3 OSPF — explicitly excluded

Deep LSA study · multi-area OSPF architecture · NSSA and stub-area design ·
virtual links · redistribution · advanced metric and cost engineering · advanced
DR/BDR design · complex routing policy.

Foundations does not become an advanced routing course.

# 11. Services scope

**DHCP.** What configuration DHCP supplies · Discover / Offer / Request /
Acknowledge at conceptual level · appropriate DHCP service configuration · lease
and binding inspection · client verification · basic relay or ip-helper concept
where appropriate.

**DNS.** Configure or use DNS-server information · distinguish IP connectivity
from name-resolution success · verify each independently · troubleshoot "IP works
but the hostname does not."

**NTP.** Foundational clock synchronisation, and why consistent timestamps
matter.

**Syslog.** Foundational device logging, and logs as operational and
troubleshooting evidence.

**Configuration transfer.** Backup and restore · bounded TFTP exposure where
technically appropriate · **explicit acknowledgement that TFTP provides neither
authentication nor encryption**, with secure alternatives preferred where
appropriate.

FTP is not required as a major standalone Foundations competency merely to cover
a protocol.

# 12. Additional topic scope

| Topic | Scope decision |
|---|---|
| **ACL** | Routing decides where traffic *can* go; policy decides whether it is *permitted*. One bounded practical exercise is sufficient. |
| **NAT/PAT** | Foundational purpose and one small practical example where it fits naturally. It must not dominate the two-site internal-routing progression. |
| **STP** | Why Layer-2 loops matter, and basic state inspection. Advanced STP design is not a Foundations requirement. |
| **CDP/LLDP** | Neighbour discovery used as operational evidence. |
| **IPv6** | Foundational awareness and basic literacy, so the course does not imply networking is IPv4-only. The primary practical ROAS and OSPF path remains IPv4 for this course. |

# 13. Progressive fault scope

Seeded faults may progressively include: interface administratively down ·
incorrect host address or prefix · wrong default gateway · wrong access VLAN ·
missing VLAN · trunk missing a required VLAN · incorrect 802.1Q subinterface
mapping · wrong subinterface address · wrong transit address or prefix · missing
or incorrect static route · OSPF missing required participation · OSPF area
mismatch where technically appropriate · missing learned route · DHCP failure ·
DNS-specific failure after IP connectivity succeeds · configuration that works
but was never saved.

**Difficulty must progress.** All of these must not appear in one beginner
exercise.

# 14. Configuration persistence — binding

A configuration task is **not complete** merely because the commands were
accepted, or because the running state happens to work.

Where the device model supports persistence, the learner must:

```
CONFIGURE → VERIFY OPERATIONAL STATE → TEST BEHAVIOUR
          → SAVE → VERIFY SAVED STATE → PROVE
```

The competency is **running state versus persisted state**. Representative
Cisco-style operations are illustrative only; the approved NOS may express them
differently, and no syntax is frozen here.

The validation contract that follows from this — that operational and persisted
state are reportable separately — is owned by `LAB-008`.

# 15. Show commands are evidence — binding

Practical curriculum must **not** teach inspection commands as a memorisation
checklist. Every verification command is connected to a question:

```
QUESTION → CHOOSE EVIDENCE → RUN COMMAND → READ RESULT
         → STATE WHAT IT PROVES → STATE WHAT IT DOES NOT PROVE
         → CHOOSE NEXT ACTION
```

This extends the Mission 7 evidence doctrine into real labs.

Representative command families, where the platform supports them:
`show running-config` · `show startup-config` · `show ip interface brief` ·
`show interfaces` · `show interfaces status` · `show interfaces switchport` ·
`show vlan brief` · `show interfaces trunk` · `show mac address-table` ·
`show spanning-tree` · `show cdp neighbors` · `show lldp neighbors` · `show arp` ·
`show ip route` · `show ip route ospf` · `show ip protocols` ·
`show ip ospf neighbor` · `show clock` · `show logging` · `ping` · `traceroute`.

**No exercise requires every command.** The skill is choosing the command that
answers the diagnostic question in front of the learner.

# 16. Assistance gradient — binding

Practical instruction deliberately reduces assistance as the learner progresses.

| Stage | What the instruction supplies |
|---|---|
| **Early** | The goal **and** the command |
| **Next** | The goal; the learner recalls the command |
| **Later** | A configuration requirement; the learner determines the sequence |
| **Capstone** | Business and technical requirements; the learner determines configuration, ordering, evidence, troubleshooting and persistence |

```
COPY → RECALL → APPLY → INTEGRATE → TROUBLESHOOT → PROVE
```

No adaptive AI completion of learner commands.

# 17. Learn / Do / Prove

| Layer | Owns |
|---|---|
| **LEARN** | Architect-authored instruction, topology, packet journeys, explanations, predictions, conceptual reasoning |
| **DO** | The isolated Lab Engine environment, real command entry, real configuration state |
| **PROVE** | The deterministic validator, examining actual required state and behaviour |

**AI coaches, explains, gives graduated hints and repairs misconceptions.**

**AI does not** silently complete practical work, become the factual validator,
or decide pass or fail. This restates DEC-062 and CURR-011 §12; neither is
changed here.

The infrastructure mapping is owned by `LAB-012`; the validator contract by
`LAB-008`.

# 18. Topology identity consistency — binding

Learner-facing identity must remain consistent between instruction and lab. A
device the lesson calls **PC-A**, **PC-B**, **Switch-1**, **Router-1**,
**Router-2**, **Switch-2**, **PC-C** or **PC-D** carries that identity into
the lab.

Implementation-specific interface names remain authentic where they are real, and
must be **explicitly mapped back** to the learner-facing topology.

A learner must not enter a lab and find unrelated hostnames, addresses or
interfaces with no instructional mapping.

# 19. Ownership boundaries

| Concern | Canonical owner |
|---|---|
| Two-course path, course boundary, stage and area scope, target topology, evidence doctrine, assistance gradient, topic scope, OSPF boundary, persistence competency | **CURR-012** (this document) |
| Operational-versus-persisted validation, network-state validator categories | **LAB-008** |
| Learn/Do/Prove infrastructure mapping, topology identity in the lab, Proxmox beneath the Lab Engine | **LAB-012** |
| The course-boundary decision itself | **DEC-053**, as amended |
| Hands-on requirement and the AI-validation prohibition | **DEC-062** |
| Curriculum quality review and the three-tier authority | **CURR-009** §12, §14a |

Requirements are cross-referenced rather than duplicated. Where two documents
appear to state the same rule, this table names which one is operative.

# 20. Dependencies

## Depends On

- `CURR-003` — Course, Module and Mission Definition.
- `CURR-004` — Competency and Prerequisite Definitions.
- `CURR-009` — Curriculum Quality Checklist.
- `LAB-008` — Deterministic Lab Validation.
- `DEC-053` (as amended) and `DEC-062`.

## Integrates With

- `CURR-010`, `CURR-011` — instructional steps and interaction contract.
- `LAB-001`, `LAB-007`, `LAB-012` — lab definition, isolation, Proxmox provider.

# 21. AI Usage

AI may explain, hint and coach against this architecture. AI may not author
curriculum under it, may not decide scope questions it does not answer, and may
not validate learner work. Scope questions this document does not settle are
returned to the Architect.

# 22. Acceptance Criteria

## Founder can

- Read the boundary between Course 01 and Course 02 in one place.
- See which course owns any given networking competency.
- See what is deliberately excluded, and why.

## Platform can

- Scope a future networking work package without re-deriving the decision.
- Keep the existing Router-on-a-Stick curriculum, competencies and gates intact.

# 23. Definition of Done

CURR-012 is complete when the two-course path is recorded, the boundary is
unambiguous, the practical doctrine is stated, ownership is cross-referenced
rather than duplicated, and the DEC-053 amendment is in place.

**This document authorizes no implementation.** Each area is built under its own
approved work package.

---

# 24. Founder Approval

**Should this Feature exist?**

- [x] Approved
- [ ] Deferred
- [ ] Rejected

Approved by the **DEC-053 amendment**, *the two-course Networking Foundations
learning path*, which records the course-boundary ruling this document makes
operative. `DEC-062` supplies the hands-on requirement it implements.

---

# 25. Revision History

| Version | Date | Summary |
|---|---|---|
| 1.0 | 2026-09-06 | Initial Feature specification. Records the two-course networking learning path and the boundary between Networking Foundations and Router-on-a-Stick: Course 01 establishes the conceptual and operational floor and gains CLI operation, practical addressing and configuration persistence; Course 02 retains ownership of VLANs, trunking, 802.1Q and Router-on-a-Stick, and is approved for future expansion to secure management, foundational services, a second site, transit and static routing, single-area OSPF, operational networking and a two-site capstone. Also records the two-site target topology, the OSPF boundary, the evidence-command doctrine, the assistance gradient, topic scope, and topology identity consistency. Authorizes no implementation and authors no learner-facing curriculum. |
