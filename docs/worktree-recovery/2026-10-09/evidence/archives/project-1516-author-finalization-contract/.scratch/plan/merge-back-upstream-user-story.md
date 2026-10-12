As a governed epic integrator, I need merge-back cleanup to tolerate a published pre-rebase child tip.
I want to delete the merged local child branch safely even when its configured upstream still points to the old commit.
So that a successful child integration can converge to Done without force deletion or false failure.
