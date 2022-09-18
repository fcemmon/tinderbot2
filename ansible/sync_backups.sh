#!/bin/bash

/usr/bin/rsync -az 65.108.104.217:backups/ /mnt/archive/backups/tinderbot_prod/
/usr/bin/rsync -az 65.108.104.217:.tinderbot_backups /mnt/archive/backups/tinderbot_prod/
