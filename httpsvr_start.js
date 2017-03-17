var sys = require('util')
var exec = require('child_process').exec;
function puts(error, stdout, stderr) { sys.puts(stdout) }
//exec("http-server . -p 8081 -d false", puts);
exec("http-server . -p 8081 -d false > log.txt 2>&1 &", puts);


