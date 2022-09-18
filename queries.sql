update tinder_accounts
set swipes_past24h = count
from (
select
    max(tinder_swipes.created_at) maxc,
    min(tinder_swipes.created_at) minc,
    tinder_account_id id,
    count(*)
from tinder_swipes
where tinder_swipes.created_at BETWEEN timezone('utc', NOW()) - INTERVAL '24 HOURS'
AND timezone('utc', NOW())
group by tinder_account_id
order by maxc desc) t
WHERE t.id = tinder_accounts.id;

SELECT t.day::date
FROM   generate_series(timestamp '2022-05-28'
                     , timestamp '2022-06-10'
                     , interval  '1 day') AS t(day);


select status, array_agg(count) from (
    select d.date, s.status, count(t.status)
    FROM (
        select distinct status from tinder_accounts
    ) s
    cross join (
        SELECT t.day::date date
        FROM generate_series(
            timestamp '2022-05-28',
            timestamp '2022-06-10',
            interval  '1 day'
        ) AS t(day)
    ) d
    left outer join (
        select distinct on (
            tinder_accounts.id,
            date_trunc('day', asu.created_at)
        ) tinder_accounts.id,
        date_trunc('day', asu.created_at) date,
        asu.status
        from tinder_accounts
        join account_status_updates asu on asu.tinder_account_id = tinder_accounts.id
        order by date_trunc('day', asu.created_at)
    ) t on d.date = t.date and s.status = t.status
    group by d.date, s.status
    order by d.date desc
    -- GROUP BY d.date, s.status
    -- ORDER BY d.date
)t
group by status
;


select count(*)
from (
    SELECT t.day::date date
    FROM generate_series(
      timestamp '2022-05-28',
      timestamp '2022-06-10',
      interval  '1 day'
    ) AS t(day)
) d
join tinder_accounts ta
join


select count(*)
from tinder_accounts
join (
    SELECT t.day::date date
    FROM generate_series(
      timestamp '2022-05-28',
      timestamp '2022-06-10',
      interval  '1 day'
    ) AS t(day)


select status, array_agg(count) from (
    select d.date, s.status, count(t.status)
    FROM (
        select distinct status
        from swipe_jobs
        where status in ('completed', 'failed')
    ) s
    cross join (
        SELECT t.day::date date
        FROM generate_series(
            timestamp '2022-05-28',
            timestamp '2022-06-10',
            interval  '1 day'
        ) AS t(day)
    ) d
    left outer join (
        select distinct on (
            id,
            created_at::date
        ) swipe_jobs.id,
        date_trunc('day', created_at) date,
        status
        from swipe_jobs
        order by created_at::date
    ) t on d.date = t.date and s.status = t.status
    group by d.date, s.status
    order by d.date desc
)t
group by status
;

SELECT t.day::date date
FROM generate_series(
    date_trunc('day', now() - INTERVAL '15 day')::timestamp without time zone,
    date_trunc('day', now())::timestamp without time zone,
    interval  '1 day'
) AS t(day)
