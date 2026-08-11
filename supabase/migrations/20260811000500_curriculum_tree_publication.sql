-- Technical Learning Platform
-- Wave 2 Batch 3: full-tree publication helper

create or replace function public.curriculum_publish_learning_path_tree(
    target_learning_path_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    update public.learning_paths
    set publication_state = 'published'
    where id = target_learning_path_id;

    update public.courses
    set publication_state = 'published'
    where learning_path_id = target_learning_path_id;

    update public.learning_modules
    set publication_state = 'published'
    where course_id in (
        select id
        from public.courses
        where learning_path_id = target_learning_path_id
    );

    update public.missions
    set publication_state = 'published'
    where module_id in (
        select lm.id
        from public.learning_modules lm
        join public.courses c on c.id = lm.course_id
        where c.learning_path_id = target_learning_path_id
    );

    update public.competencies
    set publication_state = 'published'
    where id in (
        select distinct mc.competency_id
        from public.mission_competencies mc
        join public.missions m on m.id = mc.mission_id
        join public.learning_modules lm on lm.id = m.module_id
        join public.courses c on c.id = lm.course_id
        where c.learning_path_id = target_learning_path_id
    );
end;
$$;

revoke all on function public.curriculum_publish_learning_path_tree(uuid)
from public, anon, authenticated;

insert into public.platform_schema_version (component, version)
values ('curriculum-tree-publication', '0.1.0')
on conflict (component, version) do nothing;
