//This file is in charge of providing a sandbox to execute
//actions inside a folder

import fs from 'fs'
import path from 'path'
import YAML from 'yaml'
import { spawn, exec, ChildProcess } from 'child_process'
import { performance } from 'perf_hooks'

class ActionsHost
{
    constructor(id, base_folder)
    {
        if(!base_folder || !id)
            throw("folder not specified");
        this.folder = base_folder + "/S" + id;
        this.id = id;
        this.child_processes = [];
    }

    prepare()
    {
        //create folder
        if (fs.existsSync(this.folder))
            this.reset(); //remove content
        console.log(" + creating host ");
        fs.mkdirSync(this.folder);
    }

    executeAction( action, params, node_id, output_callback )
    {
        var that = this;
        var action_info = ActionsDB.actions[action];
        if(!action_info)
            return false;

        console.log(" ## executing action:", action);
        var start_time = performance.now();
        //console.log(params);

        //execute code sync
        /*
        var cp = exec('ls -l', function(err, stdout, stderr) {
            // handle err, stdout, stderr
            that.progressAction(node_id,stdout,stderr);
        });
        */

        return new Promise((resolve,reject)=>{

            var script = action_info.script;
            var joined_script = script.split("\n").join(" ; "); //clear breaklines
            //replace params
            for(var i in params)
                joined_script = joined_script.replaceAll("$" + i, params[i]);
            
            /*
            var t = tokenize(script);
            //replace with params
            for(var i = 1; i < t.length; ++i)
            {
                var token = t[i];
                if(token[0] == '$')
                    t[i] = params[ token.substr(1) ] || "";
            }

            //check folder is ready
            if (!fs.existsSync(this.folder)) {
                reject("folder not found");
            }
            */

            //console.log(t);
            //const child = spawn(t[0], t.slice(1), {cwd: this.folder, env: process.env});
            const child = spawn(joined_script, [], {shell:true, cwd: this.folder, env: process.env});
            //const child = spawn(action_info.script, []);
            //const child = spawn('sh', [action_info.script]);
            //const child = spawn('sleep', [5]); //"sleep 5"

            that.child_processes.push(child);
            var stdout = [];
            var stderr = [];

            child.stdout.on('data', (data) => {
                var str = data.toString();
                console.log(" - - ", str );
                stdout.push(str);
                if(output_callback)
                    output_callback(node_id,"out",str);
            });
            
            child.stderr.on('data', (data) => {
                var str = data.toString();
                console.log(str);
                stderr.push(str);
                if(output_callback)
                    output_callback(node_id,"err",str);
            });

            child.on('error', (err) => {
                var str = err.toString()
                console.log(str);
                console.log(`Error in action ${str}`);
                reject(node_id,err);
              });              
            
            child.on('exit', (code) => {
              //console.log(` * Action finished code ${code}`);
              var index = that.child_processes.indexOf(this);
              that.child_processes.splice(index,1);
              var elapsed = performance.now() - start_time;
              resolve({node_id,code,stdout,stderr,elapsed});
            });
        });
    }

    reset()
    {
        //kill all processes
        for(var i = 0; i < this.child_processes.length; ++i)
        {
            var child = this.child_processes[i];
            child.kill('SIGTERM');
        }
        this.child_processes = [];        

        //remove content of folder
        if (fs.existsSync(this.folder)) {
            console.log(" + destroying host" );
            fs.rmSync(this.folder, { recursive: true, force: true });
        }
    }

    //kills the folder as it is temporary
    destroy()
    {
        //kill folder content
        this.reset();
    }
}

//all available actions
var ActionsDB = {
    actions: {},

    load(path, check_changes)
    {
        var that = this;
        console.log("loading pool of actions")
        var files = fs.readdirSync(path);
        for(var i = 0; i < files.length; ++i)
            if(files[i].indexOf("yaml") != -1)
            {
                var action = this.registerAction(path + "/" + files[i]);
                console.log(" * " + action.name + " :: " + action.desc)
            }

        if(check_changes)
        fs.watch(path, (eventType, filename) => {
            if(eventType == "change" || 0)
            {
                console.log("action updated: ", filename);
                that.registerAction( path + "/" + filename);
            }
            console.log(eventType);
            // could be either 'rename' or 'change'. new file event and delete
            // also generally emit 'rename'
            //console.log(filename);
        })            
    },

    registerAction(action_path)
    {
        var data = fs.readFileSync(action_path, 'utf8');
        var node_info = YAML.parse(data)
        this.actions[ node_info.name ] = node_info;
        return node_info
    }    
};

function tokenize(str)
{
    //The parenthesis in the regex creates a captured group within the quotes
    var myRegexp = /[^\s"]+|"([^"]*)"/gi;
    var result = [];

    do {
        //Each call to exec returns the next regex match as an array
        var match = myRegexp.exec(str);
        if (match != null)
        {
            //Index 1 in the array is the captured group if it exists
            //Index 0 is the matched text, which we use if no captured group exists
            result.push(match[1] ? match[1] : match[0]);
        }
    } while (match != null);
    return result; 
}


export { ActionsHost, ActionsDB }