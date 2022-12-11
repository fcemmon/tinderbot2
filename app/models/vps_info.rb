class VpsInfo < ApplicationRecord
  has_many :swipe_jobs, dependent: :destroy

  before_destroy :cancel_swipe_jobs

  def cancel_swipe_jobs
    swipe_jobs.each(&:cancel!)
  end

  belongs_to :user
  belongs_to :schedule, optional: true

  def k8s
    K8sAccount.new(self)
  end
  
end
