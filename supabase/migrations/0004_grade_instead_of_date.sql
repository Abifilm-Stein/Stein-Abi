-- Replace the capture date with the school year the material is from.
--
-- "In welcher Stufe war das?" is a question people can answer about a photo
-- from four years ago; "Juni 2021" is not. It also matches how the film team
-- groups material.
--
-- text with a check constraint rather than an enum: the set is small but may
-- need adjusting (a G8 cohort, an extra category), and altering an enum in
-- Postgres is far more painful than editing a constraint.

alter table submissions
  add column grade text;

-- Best-effort carry-over for rows created before this change. The mapping
-- assumes the 2026 cohort (Q2 in the 2025/26 school year, school year starting
-- in August), so an August..July window maps onto one grade. Anything outside
-- the range stays null and the team can fill it in.
update submissions
   set grade = case
         when taken_at >= date '2017-08-01' and taken_at < date '2018-08-01' then '5'
         when taken_at >= date '2018-08-01' and taken_at < date '2019-08-01' then '6'
         when taken_at >= date '2019-08-01' and taken_at < date '2020-08-01' then '7'
         when taken_at >= date '2020-08-01' and taken_at < date '2021-08-01' then '8'
         when taken_at >= date '2021-08-01' and taken_at < date '2022-08-01' then '9'
         when taken_at >= date '2022-08-01' and taken_at < date '2023-08-01' then '10'
         when taken_at >= date '2023-08-01' and taken_at < date '2024-08-01' then 'EF'
         when taken_at >= date '2024-08-01' and taken_at < date '2025-08-01' then 'Q1'
         when taken_at >= date '2025-08-01' and taken_at < date '2026-08-01' then 'Q2'
         else null
       end
 where taken_at is not null;

alter table submissions
  add constraint submissions_grade_valid
  check (grade is null or grade in ('5', '6', '7', '8', '9', '10', 'EF', 'Q1', 'Q2'));

alter table submissions
  drop column taken_at;

-- The team filters by year, so give it an index.
create index submissions_grade_idx on submissions (grade);
