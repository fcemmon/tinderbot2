- run every hour
- run every 2 hours
- run every 2 days
- run 4 times a day at random times
- run 200 swipes per day for 5 days (at which time? - during which hours?)
- run 200 swipes per day randomly for 5 days

- run 200 swipes per day for 7 days at random times between 10am and 6pm EST

*randomize the number of swipes*

- record all db->k8s calls
- record all tinder_account status updates
- record all job runs
- record all job status updates

- number of swipes per day (approx)

for every account with a schedule:
  - is a current job running for the account? if yes, skip
  - is account active? if no, skip
  - has hit target # of swipes?, if yes, skip
  - is it in the target time range? if no, skip?

what if it hasn't hit the target number and it's out of the time range for that day?
should it keep trying or not?
What if there's a current job running?


currently the schedule only runs once a day

say I schedule something to run between 6pm-8pm
I create the schedule at 5pm
the schedule will run and create the jobs for today at 6-8pm
the schedule won't run until the next day at 5pm

it will create the jobs again the next day between 6-8pm


say I create a schedule at 5pm
the range is 3-4pm
when I run the schedule, it should create jobs between 3-4pm the next day

