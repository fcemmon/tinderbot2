#!/bin/bash
# as root
set -eu
apt update
apt dist-upgrade
apt install ubuntu-mate-desktop
# select lightdm
apt install tightvncserver
useradd -m -d /home/bijan -g sudo bijan
passwd bijan
reboot

# after reboot
echo PASSWORD | vncpasswd -f > ~/.vnc/passwd
vncserver :1
vncserver -kill :1
# set password

mv /home/bijan/.vnc/xstartup /home/bijan/.vnc/xstartup.bak
echo "#!/bin/bash\nexec /usr/bin/mate-session &" > /home/bijan/.vnc/xstartup
chmod +x /home/bijan/.vnc/xstartup

apt install tmux

# from local machine
ssh -L 5901:127.0.0.1:5901 bijan@139.144.34.102


# as remote user

# oh-my-zsh
sudo apt install -y zsh
sh -c "$(curl -fsSL https://raw.github.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"

# fnm
curl -fsSL https://fnm.vercel.app/install | bash
fnm_text='
export PATH=/home/bijan/.fnm:$PATH
eval "`fnm env`"
'
echo $fnm_text >> ~/.zshrc
fnm install v18.1.0

# gologin
wget https://dl.gologin.com/gologin.tar
tar -xvf ~/gologin.tar

# node libraries
sudo npm install -g yarn
yarn add puppeteer-core gologin
