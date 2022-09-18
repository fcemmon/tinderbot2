#!/bin/bash

set -eu

FILENAME="/home/bijan/.tinderbot_backups/tinderbot_prod_$(date +%F_%T).bak"
/usr/bin/pg_dump tinderbot_prod -Fc  > $FILENAME
