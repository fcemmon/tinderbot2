#!/bin/bash

trapped()
{
    ec=$?
    echo "caught trap $ec $1"
}

trap "trapped $1" EXIT
exit 1
