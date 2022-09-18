# First we get and update last Ubuntu image
FROM    ubuntu:focal
LABEL   maintainer="cyd@9bis.com"

ARG     PROXY_CERT
RUN     test -z "${PROXY_CERT}" || { echo "${PROXY_CERT}" | base64 -d | tee /usr/local/share/ca-certificates/ca-local.crt > /dev/null && update-ca-certificates ; }

ARG     TZ=${TZ:-Etc/UTC}
ARG     DEBIAN_FRONTEND=noninteractive
RUN     \
        echo "Timezone and locale" >&2                     \
        && apt-get update                                  \
        && apt-get install -y                              \
          apt-utils                                        \
          language-pack-fr                                 \
          tzdata                                           \
        && apt-get clean                                   \
        && apt-get autoremove -y                           \
        && rm -rf /tmp/* /var/tmp/*                        \
        && rm -rf /var/lib/apt/lists/* /var/cache/apt/*    \
        && echo "Timezone and locale OK" >&2

# Second we install VNC, noVNC and websockify
RUN     \
        echo "install VNC, noVNC and websockify" >&2       \
        && apt-get update                                  \
        && apt-get install -y --no-install-recommends      \
          libpulse0                                        \
          x11vnc                                           \
          xvfb                                             \
          novnc                                            \
          websockify                                       \
        && apt-get clean                                   \
        && apt-get autoremove -y                           \
        && rm -rf /tmp/* /var/tmp/*                        \
        && rm -rf /var/lib/apt/lists/* /var/cache/apt/*    \
        && echo "install VNC, noVNC and websockify OK" >&2

# And finally xfce4 and ratpoison desktop environments
RUN     \
        echo "Install xfce4 and ratpoison" >&2             \
        && apt-get update                                  \
        && apt-get install -y --no-install-recommends      \
          dbus-x11                                         \
        && apt-get install -y                              \
          ratpoison                                        \
          xfce4 xfce4-terminal xfce4-eyes-plugin           \
          xfce4-systemload-plugin xfce4-weather-plugin     \
          xfce4-whiskermenu-plugin xfce4-clipman-plugin    \
          xserver-xorg-video-dummy                         \
        && apt-get clean                                   \
        && apt-get autoremove -y                           \
        && rm -rf /tmp/* /var/tmp/*                        \
        && rm -rf /var/lib/apt/lists/* /var/cache/apt/*    \
        && echo "Install xfce4 and ratpoison OK" >&2

# We add some tools
RUN     \
        echo "Install some tools" >&2                      \
        && apt-get update                                  \
        && apt-get install -y --no-install-recommends      \
          curl                                             \
          dumb-init                                        \
          figlet                                           \
          jq                                               \
          libnss3-tools                                    \
          mlocate                                          \
          net-tools                                        \
          sudo                                             \
          vim                                              \
          vlc                                              \
          xz-utils                                         \
          zip                                              \
        && apt-get install -y thunar-archive-plugin        \
        && apt-get clean                                   \
        && apt-get autoremove -y                           \
        && rm -rf /tmp/* /var/tmp/*                        \
        && rm -rf /var/lib/apt/lists/* /var/cache/apt/*    \
        && echo "Install some tools OK" >&2

# We can add additional GUI programs (ex: firefox)
RUN     \
        echo "Install GUI programs, firefox" >&2           \
        && apt-get update                                  \
        && apt-get install -y --no-install-recommends      \
          firefox                                          \
          notepadqq                                        \
        && apt-get clean                                   \
        && apt-get autoremove -y                           \
        && rm -rf /tmp/* /var/tmp/*                        \
        && rm -rf /var/lib/apt/lists/* /var/cache/apt/*    \
        && echo "Install GUI programs, firefox OK" >&2

# We add sound
RUN     printf 'default-server = unix:/run/user/1000/pulse/native\nautospawn = no\ndaemon-binary = /bin/true\nenable-shm = false' > /etc/pulse/client.conf

# We add a simple user with sudo rights
ENV     USR=user
ARG     USR_UID=${USER_UID:-1000}
ARG     USR_GID=${USER_GID:-1000}

RUN     \
        echo "Add simple user" >&2                                                      \
        && groupadd --gid ${USR_GID} ${USR}                                             \
        && useradd --uid ${USR_UID} --create-home --gid ${USR} --shell /bin/bash ${USR} \
        && echo "${USR}:${USR}01" | chpasswd                                            \
        && echo ${USR}'     ALL=(ALL) NOPASSWD:ALL' >> /etc/sudoers                     \
	&& echo "Add simple user OK" >&2

# Two ports are availables: 5900 for VNC client, and 6080 for browser access via websockify
EXPOSE  5900 6080

# We set localtime
RUN      if [ "X${TZ}" != "X" ] ; then if [ -f /usr/share/zoneinfo/${TZ} ] ; then rm -f /etc/localtime ; ln -s /usr/share/zoneinfo/${TZ} /etc/localtime ; fi ; fi

# We do some specials
RUN     \
        updatedb ;                                       \
        apt-get clean                                    \
        && apt-get autoremove -y                         \
        && rm -rf /tmp/* /var/tmp/*                      \
        && rm -rf /var/lib/apt/lists/* /var/cache/apt/*

RUN echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list
RUN wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -

ARG NODE_VERSION=17
RUN apt-get update -y && \
    apt-get upgrade -y && \
    apt-get install -y && \
    curl -sL https://deb.nodesource.com/setup_$NODE_VERSION.x | bash - && \
    apt-get install -y nodejs postgresql-14 iputils-ping ffmpeg

RUN apt purge light-locker -y

RUN npm install -g yarn

# And here is the statup script, everything else is in there

# We change user
USER    ${USR}
WORKDIR /home/${USR}
COPY    --chown=${USR}:${USR} functions.sh /home/${USR}/.functions.sh
COPY    --chown=${USR}:${USR} bgimage.jpg /usr/share/backgrounds/xfce/bgimage.jpg
# COPY    --chown=${USR}:${USR} swindler.jpg /usr/share/backgrounds/xfce/bgimage.jpg
RUN     \
        printf 'if [[ $- = *i* ]] ; then test -f ~/.functions.sh && . ~/.functions.sh ; fi' >> /home/${USR}/.bashrc

# copy the orbita browser
RUN mkdir /home/${USR}/.gologin
RUN chown ${USR}:${USR} /home/${USR}/.gologin
COPY  --chown=${USR}:${USR} ["./browser", "/home/user/.gologin/browser"]
RUN chown ${USR}:${USR} /home/${USR}
WORKDIR /home/${USR}
# copy the code we're going to run
# RUN mkdir -p /home/user/tbot/js
COPY --chown=${USR}:${USR} ["js", "/home/user/tbot/js"]

# run yarn
WORKDIR /home/${USR}/tbot/js
RUN yarn

RUN mkdir /tmp/.X11-unix
# RUN chown root:root /tmp/.X11-unix

USER    root
COPY    entrypoint.sh /entrypoint.sh
RUN     chmod 755 /entrypoint.sh
USER    ${USR}
WORKDIR /home/${USR}/tbot/js
ENV PATH="/home/${USR}/.yarn/bin:${PATH}"
RUN yarn
RUN yarn global add ts-node

ENTRYPOINT [ "/entrypoint.sh" ]
