// =====================================================================
//  Default Linux files
//  Lots of "normal" files to distract the player. Some contain fake
//  passwords. A path ending with "/" is an empty directory.
//  Every machine gets its own set, with its own user, host and IPs.
// =====================================================================
function defaultFiles(user, host, ips) {
    const BIN = '\x7fELF\x02\x01\x01\x00\x00\x00 >\x00\x01 @\x00 (binary file)'; // Looks like a program
    const files = {
        // --- Root directories ---
        '/boot/vmlinuz-5.15.0-91-generic': BIN,
        '/boot/initrd.img-5.15.0-91-generic': BIN,
        '/boot/grub/grub.cfg': 'set default="0"\nset timeout=5\nmenuentry "Ubuntu" {\n  linux /boot/vmlinuz-5.15.0-91-generic root=/dev/sda1 ro quiet splash\n}',
        '/dev/null': '',
        '/dev/tty': '',
        '/dev/sda1': BIN,
        '/lib/x86_64-linux-gnu/libc.so.6': BIN,
        '/media/': null,
        '/mnt/': null,
        '/srv/': null,
        '/tmp/.X11-unix/': null,
        '/tmp/systemd-private-8f2a1c-apache2.service-Xk2Lq/': null,
        '/tmp/sess_a81f9c2b': 'user_id|i:1;logged_in|b:0;',

        // --- /root: root only ---
        '/root/.bashrc': '# ~/.bashrc for root\nexport PS1="\\u@\\h:\\w# "',
        '/root/.bash_history': 'ufw status\ncat /etc/shadow\napt upgrade -y\nreboot',

        // --- /etc: system configuration ---
        '/etc/hostname': host,
        '/etc/hosts': `127.0.0.1\tlocalhost\n127.0.1.1\t${host}\n\n# The following lines are desirable for IPv6 capable hosts\n::1     ip6-localhost ip6-loopback`,
        '/etc/passwd': [
            'root:x:0:0:root:/root:/bin/bash',
            'daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin',
            'bin:x:2:2:bin:/bin:/usr/sbin/nologin',
            'sys:x:3:3:sys:/dev:/usr/sbin/nologin',
            'www-data:x:33:33:www-data:/var/www:/usr/sbin/nologin',
            'sshd:x:110:65534::/run/sshd:/usr/sbin/nologin',
            'mysql:x:111:116:MySQL Server,,,:/nonexistent:/bin/false',
            `${user}:x:1000:1000:${user},,,:/home/${user}:/bin/bash`,
        ].join('\n'),
        '/etc/group': `root:x:0:\nsudo:x:27:${user}\nwww-data:x:33:\n${user}:x:1000:`,
        '/etc/shadow': `root:$6$Vx8rT2qL$3kQ0b9Zp1mW7yHc2NfE5sJ4uRgT8vXa0LdKoP6iB1nM:19682:0:99999:7:::\ndaemon:*:19682:0:99999:7:::\n${user}:$6$aP3nZ7wQ$9fLm2XcV8bN1kJ4hG6dS0qWeR5tY7uIoP3aZxCvBnM:19682:0:99999:7:::`,
        '/etc/sudoers': 'Defaults env_reset\nroot  ALL=(ALL:ALL) ALL\n%sudo ALL=(ALL:ALL) ALL',
        '/etc/os-release': 'NAME="Ubuntu"\nVERSION="22.04.3 LTS (Jammy Jellyfish)"\nID=ubuntu\nPRETTY_NAME="Ubuntu 22.04.3 LTS"',
        '/etc/fstab': 'UUID=3f1c2e7a-91b4-4d2e-a1f0-7c9d8e2b1a44 /    ext4 errors=remount-ro 0 1\n/swapfile none swap sw 0 0',
        '/etc/resolv.conf': 'nameserver 127.0.0.53\noptions edns0 trust-ad',
        '/etc/crontab': 'SHELL=/bin/sh\n# m h dom mon dow user command\n17 *  * * *  root  cd / && run-parts --report /etc/cron.hourly\n0 3  * * *  root  /opt/backup.sh',
        '/etc/ssh/sshd_config': 'Port 22\nPermitRootLogin no\nPasswordAuthentication yes\nX11Forwarding yes',
        '/etc/ufw/ufw.conf': 'ENABLED=yes\nLOGLEVEL=low',
        // Network setup, shows the machine's real IP addresses
        '/etc/netplan/01-netcfg.yaml': 'network:\n  version: 2\n  ethernets:\n' +
            ips.map((ip, i) => `    eth${i}:\n      addresses: [${ip}/24]`).join('\n'),
        '/etc/apt/sources.list': 'deb http://archive.ubuntu.com/ubuntu jammy main restricted\ndeb http://archive.ubuntu.com/ubuntu jammy-updates main restricted',
        '/etc/mysql/my.cnf': '[mysqld]\nbind-address = 127.0.0.1\n# the password is NOT stored here anymore',

        // --- /var: logs, web and backups ---
        '/var/log/syslog': `Nov 22 08:01:12 ${host} systemd[1]: Started Daily apt download activities.\nNov 22 08:14:55 ${host} CRON[1123]: (root) CMD (/opt/backup.sh)\nNov 22 09:30:02 ${host} kernel: [UFW BLOCK] IN=eth0 SRC=185.23.11.4`,
        '/var/log/auth.log': `Nov 22 07:58:01 ${host} sshd[901]: Failed password for root from 185.23.11.4 port 51022\nNov 22 07:58:04 ${host} sshd[901]: Failed password for root from 185.23.11.4 port 51022\nNov 22 08:02:40 ${host} sudo: ${user} : TTY=pts/0 ; PWD=/home/${user} ; USER=root ; COMMAND=/usr/bin/apt update`,
        '/var/log/dpkg.log': '2026-11-20 10:12:01 install mysql-server:amd64 <none> 8.0.35\n2026-11-20 10:13:44 install apache2:amd64 <none> 2.4.52',
        '/var/log/apache2/access.log': '185.23.11.4 - - [22/Nov/2026:09:31:10] "GET /admin HTTP/1.1" 403 199\n10.0.0.12 - - [22/Nov/2026:09:40:01] "GET / HTTP/1.1" 200 512',
        '/var/www/html/index.html': '<html><body><h1>It works!</h1></body></html>',
        '/var/www/html/config.php': "<?php\n$db_host = 'db-server';\n$db_user = 'webapp';\n$db_pass = 'Pa$$w0rd!';\n?>",
        '/var/backups/passwd.bak': 'root:x:0:0:root:/root:/bin/bash\nold_admin:x:1001:1001::/home/old_admin:/bin/bash',
        '/var/backups/shadow.bak': 'root:$6$oLd5aLt$Qm3n8Bv2Cx7Zl1Kj4Hg6Fd9Sa0PoIuYtReWq:18900:0:99999:7:::\nold_admin:$6$Zz9Yy8Xx$Ab1Cd2Ef3Gh4Ij5Kl6Mn7Op8Qr9St0Uv:18900:0:99999:7:::',
        '/var/mail/': null,

        // --- /opt and /proc ---
        '/opt/backup.sh': '#!/bin/bash\n# Nightly backup\nPASS="changeme"\ntar -czf /var/backups/home.tar.gz /home',
        '/proc/version': 'Linux version 5.15.0-91-generic (buildd@lcy02-amd64-045) (gcc 11.4.0) #101-Ubuntu SMP',
        '/proc/cpuinfo': 'processor\t: 0\nvendor_id\t: GenuineIntel\nmodel name\t: Intel(R) Xeon(R) CPU E5-2680 v4 @ 2.40GHz',

        // --- The user's home directory (~) ---
        '~/.bashrc': '# ~/.bashrc\nalias ll="ls -la"\nalias la="ls -a"\nexport PATH=$PATH:/opt',
        '~/.profile': '# ~/.profile\nif [ -f ~/.bashrc ]; then . ~/.bashrc; fi',
        '~/.bash_logout': '# ~/.bash_logout\nclear',
        '~/.bash_history': 'ls -la\ncd Documents\nnano passwords.txt\nrm passwords.txt\nmysql -u root -ptoor\nssh admin@10.0.0.5\nsudo apt update\nhistory -c',
        '~/.ssh/known_hosts': '10.0.0.5 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMq...\n10.0.0.12 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIBx7...',
        '~/.ssh/id_rsa': '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAABlwAAAAdzc2gtcn\n-----END OPENSSH PRIVATE KEY-----',
        '~/.cache/motd.legal-displayed': '',
        '~/.config/htop/htoprc': 'fields=0 48 17 18 38 39 40 2 46 47 49 1\nsort_key=46',
        '~/Desktop/': null,
        '~/Documents/todo.txt': '- Call the bank\n- Change password (again!)\n- Delete old backups',
        '~/Documents/old_passwords.txt': 'facebook: summer2019\ngmail: Football123\nwifi: 12345678',
        '~/Documents/report_q3.txt': 'Quarterly report Q3\nRevenue grew by 4%.',
        '~/Downloads/setup.sh': '#!/bin/bash\necho "Installing..."\nsudo apt install -y htop',
        '~/Downloads/cat.jpg': BIN,
        '~/Pictures/vacation.png': BIN,
        '~/Pictures/mountains.jpg': BIN,
        '~/Pictures/beach.jpg': BIN,
        '~/Music/': null,
    };

    // Common programs in /bin, /sbin and /usr/bin (just binary files)
    for (const name of ['bash', 'sh', 'ls', 'cat', 'cp', 'mv', 'rm', 'mkdir', 'grep', 'su', 'sudo', 'nano', 'ps', 'kill', 'ping', 'ip']) files['/bin/' + name] = BIN;
    for (const name of ['reboot', 'shutdown', 'iptables', 'ufw', 'ifconfig', 'fdisk']) files['/sbin/' + name] = BIN;
    for (const name of ['python3', 'perl', 'ssh', 'curl', 'wget', 'vim', 'htop', 'mysql', 'nmap', 'arp', 'netstat']) files['/usr/bin/' + name] = BIN;
    files['/usr/share/doc/'] = null;
    files['/usr/lib/'] = null;

    return files;
}
