// =====================================================================
//  Commands
//  Every command gets a list of arguments (the words after the command).
//  New command? Just add a function here and it works with Tab too.
// =====================================================================
const commands = {};

// Commands: Help
Object.assign(commands, {
    help() {
        print('Files:    ls, la, ll, cd, pwd, cat, head, tail, grep, find, file, wc, strings, base64, touch, mkdir, rm, mv, echo > file');
        print('System:   whoami, id, hostname, uname, date, ps, crontab, history, echo, clear');
        print('Network:  ifconfig, ip, ping, nmap, arp, netstat, curl, ssh, rdp, ufw');
        print('Access:   su, sudo, startx, exit');
        print(`Goal: get root access on ${target.host}.`);
    },
});
