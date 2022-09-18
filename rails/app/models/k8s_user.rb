require 'open3'
include ActionView::Helpers::DateHelper

class K8sUser
  MAX_JOBS = 20

  def initialize(user)
    @user = user
  end

  def log(msg)
    puts "#{msg}"
  end

  def create_namespace
    # cmd = "kubectl apply -f -n #{namespace}"
    cmd = "NAMESPACE=#{namespace} envsubst < ../k8s/user.yml | kubectl apply -f -"
    stdout, stderr, status = Open3.capture3(cmd)
  end

  def delete_all_jobs(cancel=false)
    job_status = cancel ? 'cancelled' : 'pending'
    jobs_names.map do |jobname|
      log "deleting #{jobname}"
      sj = SwipeJob.find(jobname.split("-")[2])
      # log "updating sj #{sj.id} #{sj.status} to cancelled"
      sj.update!(status: job_status)
      cmd = "kubectl delete -n #{namespace} job #{jobname}"
      stdout, stderr, status = Open3.capture3(cmd)
      stdout
    end
    SwipeJob.where(
      user: @user,
      status: 'running'
    ).update_all(status: job_status)
  end

  def sync_jobs
    # set scheduled jobs to pending
    SwipeJob
      .where(status: 'scheduled')
      .where("scheduled_at < ?", Time.now)
      .update(status: 'pending')

    # puts "\n--------------------------syncing #{namespace}-------------------------------"
    k8_running_ids = jobs_ids_running
    db_running_ids = SwipeJob.running_for_user(@user).pluck(:id)

    k8_queued_ids = jobs_ids_queued
    db_queued_ids = SwipeJob.queued_for_user(@user).pluck(:id)

    mark_pending_ids = (db_running_ids - k8_running_ids) + (db_queued_ids - k8_queued_ids)

    if db_running_ids.size > k8_running_ids.size
      log "database says running while not running in k8s"
      log (db_running_ids- k8_running_ids).join(',')
    elsif db_running_ids.size < k8_running_ids.size
      log "k8s says running while not running in database"
      log (k8_running_ids - db_running_ids).join(',')
    end

    if db_queued_ids.size > k8_queued_ids.size
      log "database says queued while not queued in k8s"
      log (db_queued_ids- k8_queued_ids).join(',')
    elsif db_queued_ids.size < k8_queued_ids.size
      log "k8s says queued while not queued in database"
      log (k8_queued_ids - db_queued_ids).join(',')
    end

    if mark_pending_ids.size > 0
      log "marking IDs as pending: #{mark_pending_ids.join(',')}"
      SwipeJob.where(id: mark_pending_ids).update_all(status: 'pending')
    end

    if (k8_running_ids - db_running_ids).size > 0
      log "marking IDs as running: #{k8_running_ids.join(',')}"
      SwipeJob.where(id: k8_running_ids).where("failed_at < ?", 1.minute.ago).update_all(status: 'running')
    end

    if (k8_queued_ids - db_queued_ids).size > 0
      log "marking IDs as queued: #{k8_queued_ids.join(',')}"
      SwipeJob.where(id: k8_queued_ids).update_all(status: 'queued')
    end

    # delete k8 jobs that are cancelled/failed/completed in the database
    SwipeJob.where(
      status: ['cancelled','failed', 'completed'],
      id: [k8_queued_ids + k8_running_ids]
    ).each do |job|
      log "deleting k8 job:#{job.id} db-status:#{job.status}"
    end

    # create k8 jobs
    @user
      .swipe_jobs
      .where(status: 'pending')
      .order('id asc')
      .limit(MAX_JOBS - @user.swipe_jobs.where(status: ['running', 'queued']).count)
      .each do |job|
        running = job.tinder_account.swipe_jobs.where(status: 'running')
        if running.any?
          if job.job_type_status_check?
            job.cancel!
            log "status_check #{job.id} cannot start. tinder account is already running #{running.pluck(:id)}. Cancelling."
          else
            log "job #{job.id} cannot start. tinder account is already running #{running.pluck(:id)}. Skipping."
          end
        else
          t = job.tinder_account.status_checked_at
          last_check = t ? "#{ActionView::Helpers::DateHelper.time_ago_in_words(t)} ago" : nil
          log "CREATE id:#{job.id} type:#{job.job_type} account:#{job.tinder_account.id} last_status_check:#{last_check}"
          begin
            job.tinder_account.sync_gologin
          rescue => e
            puts "ERROR RUNNING GOLOGIN SYNC. IGNORING ERROR"
          end
          job.update_column(:status, 'running') if job.k8s.create
        end
    end
    true
  end

  # running job is a job that has a pod
  # (a job that has a non-nil duration)
  def jobs_ids_running
    jobs_status.select { |j| j['AGE'] }.reject {|j| j['COMPLETIONS'] == "1/1" }.map {|j| j['NAME'].split("-")[2].to_i }
  end

  # queued job is a job that does not have a pod
  # (a job that has a nil duration)
  def jobs_ids_queued
    jobs_status.reject { |j| j['AGE'] }.map {|j| j['NAME'].split("-")[2].to_i }
  end

  def pods_status
    convert_to_hash(pods_raw[0])
  end

  def jobs_status
    convert_to_hash(jobs_raw[0])
  end

  def convert_to_hash(stdout)
    output = stdout.split("\n")
    return {} if output[0].nil?
    cols = output[0].split(" ")
    result = []
    output[1..].map do |line|
      values = line.split(" ")
      job = {}
      cols.each_with_index { |col, i| job[col] = values[i] }
      job
    end
  end

  def namespace
    "user-#{@user.id}-#{@user.name.downcase}"
  end

  def jobs
    cmd = "kubectl get jobs -n #{namespace}"
    stdout, stderr, status = Open3.capture3(cmd)
    # convert_to_hash(stdout)
    stdout.split("\n").map {|x| x.split(" ") }[1..]
  end

  def pods
    cmd = "kubectl get pods -n #{namespace}"
    stdout, stderr, status = Open3.capture3(cmd)
    # convert_to_hash(stdout)
    stdout.split("\n").map {|x| x.split(" ") }[1..]
  end

  def pods_raw
    cmd = "kubectl get pods -n #{namespace}"
    stdout, stderr, status = Open3.capture3(cmd)
  end

  def pods_names
    raw = pods_raw[0]
    return [] if raw == ""
    raw.split("\n")[1..].map {|l| l.split(" ")[0] }
  end

  def pods_ids
    pods_names.map {|j| j.split("-")[2].to_i }
  end

  def jobs_raw
    cmd = "kubectl get jobs -n #{namespace}"
    # log cmd
    stdout, stderr, status = Open3.capture3(cmd)
    #.split(" ")[0]
    # case stdout
    # when ""
    #   nil
    # else
    #   nil
    # end
  end

  def jobs_names
    raw = jobs_raw[0]
    return [] if raw == ""
    raw.split("\n")[1..].map {|l| l.split(" ")[0] }
  end

  def jobs_ids
    jobs_names.map {|j| j.split("-")[2].to_i }
  end
end
