
//namespace
var VACIO = {}

//represents one session from one user
class Session {
    constructor(backend)
    {
        this.id = generateId();
        this.backend = backend;

        this.graph = new LGraph();
        this.graph.session = this;
        this.graph.onNodeAdded = this.onNodeCreated.bind(this);
        this.start_node = null;
        this.finish_node = null;

        this.current_node = null;

    }

    init()
    {
        var graph = this.graph;
        var node_start = LiteGraph.createNode("actions/start");
        node_start.pos = [200, 200];
        node_start.removable = true;
        node_start.clonable = false;
        graph.add(node_start);

        var node = LiteGraph.createNode("actions/sleep");
        node.pos = [600, 200];
        graph.add(node);
        
        var node_finish = LiteGraph.createNode("actions/finish");
        node_finish.pos = [1000, 200];
        node_finish.removable = true;
        node_finish.clonable = false;
        graph.add(node_finish);

        node_start.connect(0, node, 0);
        node.connect(0, node_finish, 0);

        this.start_node = node_start;
        this.finish_node = node_finish;
    }

    start()
    {
        //clear leds
        for(var i = 0; i < this.graph._nodes.length; ++i)
        {
            var node = this.graph._nodes[i];
            node.boxcolor = null;
            node.execution_state = 0;
        }
    }

    onNodeCreated(node)
    {
        if(!node.constructor.info) //generic node
            return;
        var action_info = node.constructor.info;
        node.params = {};
        for(var i in action_info.params)
            node.params[i] = action_info.params[i];
        console.log("node created",action_info.name);
    }

    //received when started
    onExecutionStarted(node,data)
    {
        node.execution_state = 1;
        this.current_node = node;
        node.log = [];
        //node.boxcolor = "#FFaa00";
    }

    //in case the action outputs to some pipe
    onExecutionProgress(node,std,data,timestamp)
    {
        console.log("std",data);
        node.log.push({timestamp, std, data});
    }

    //in case the action outputs to some pipe
    onExecutionError(node,data,timestamp)
    {
        node.execution_state = -1;
        console.log("error",data);
        node.boxcolor = "#FF0000";
    }   

    //received when done (data:{stdout,stderr,code})
    onExecutionDone(node,execution_data)
    {
        node.execution_state = 2;

        //console.log("done:",execution_data);
        if(execution_data.code != 0)
        {
            //error?
            node.log.push("execution ended with code", execution_data.code);
        }
        node.execution_data = execution_data;
        node.boxcolor = "#00FF00";
        if(node == this.finish_node)
        {
            if(this.finish_callback)
                this.finish_callback(this);
            return true;//finished
        }
        node.triggerSlot(0);//next
        return false;
    }    
}

//connects to backend to execute stuff remotely
class BackendClient {
    constructor()
    {
        this.config = {};
        this.sessions = {} //supports several sessions

        this.onNodeStateUpdate = null;
    }

    loadConfig()
    {
        return fetch("./info").then(resp=>resp.json()).then((json)=>{
            this.processConfig(json);
            if(this.onReady)
                this.onReady();
        });
    }

    processConfig(json)
    {
        this.config = json;
        for(var i in json.actions)
        {
            console.log("action: ",i)
            this.buildNodeClassFromInfo( json.actions[i] );
        }
    }
    
    buildNodeClassFromInfo(info, type)
    {
        //define node here
        function nodeExec(_in){} //empty place holder
        var params_type = [LiteGraph.ACTION];
        var return_type = LiteGraph.EVENT;
        if(info.type == "begin")
            params_type = null;
        if(info.type == "end")
            return_type = null;
        var node_class = LiteGraph.wrapFunctionAsNode("actions/" + info.name, nodeExec,params_type,return_type);
        node_class.prototype.onAction = onNodeAction;
        node_class.prototype.onDrawBackground = onNodeDrawBackground;
        node_class.info = info;

        function onNodeAction(e)
        {
            if(e == "_in")
                this.graph.session.backend.executeNode(this);
            else if(e == "end") //not necessary
                this.triggerSlot(0);
        }

        function onNodeDrawBackground(ctx)
        {
            //change color of node to show its being executed
            this.color = this.execution_state == 1 ? "#555" : null;
            this.bgcolor = this.execution_state == 1 ? "#444" : null;

            if( this.execution_state ) //finished
            {
                var y = this.size[1] + 18;
                ctx.fillStyle = "#999";
                if( this.execution_state == 1)
                    ctx.fillText("Running..." + "|/-\\"[((performance.now()*0.006)|0)%4], 4, y);
                else if( this.execution_state == 2 && this.execution_data)
                    ctx.fillText("Time: " + (this.execution_data.elapsed*0.001).toFixed(1) + "s", 4, y);
            }
        }
    }

    connect( url )
    {
        var that = this;
        this.socket = new WebSocket(url);
        this.socket.onmessage = this.onMessage.bind(this);
        this.socket.onopen = ()=>{
            that.connect_promise.resolve();
        }
        this.socket.onerror = (err)=>{ 
            that.connect_promise.reject();
            console.log("error",err)
        }
        this.socket.onclose = (err)=>{
            console.log("socket closed",err)
            if(this.onConnectionClosed)
                this.onConnectionClosed(err);
        }

        return new Promise(function(resolve,reject){
            that.connect_promise = {resolve,reject};
        });
    }

    send(msg)
    {
        if(!this.socket)
            throw("no connected");
        if(msg.constructor !== String)
            msg = JSON.stringify(msg);
        this.socket.send(msg);
    }

    onMessage(msg,ws)
    {
        if(msg.data[0] != "{") 
            return console.log("Backend <<",msg.data);
        //console.log("<<",msg.data);
        var event = JSON.parse( msg.data );
        var target_node = null;
        if(event.session_id != null && event.node_id != null )
            target_node = this.findNode( event.session_id, event.node_id );
        var session = null;
        if(event.session_id != null)
            session = this.sessions[event.session_id];

        switch(event.type)
        {
            case "SESSION_READY": 
                this.sessionReady( event.session_id );
                break;
            case "ACTION_STARTED": 
                if(target_node)
                    session.onExecutionStarted( target_node, event.data );
                break;
            case "ACTION_ERROR": 
                if(event.error)
                    console.error(event.error);
                if(target_node)
                    session.onExecutionError( target_node, event.data, event.time );
                if(session.finish_callback)
                    session.finish_callback(true);
                break;
            case "ACTION_PROGRESS": 
                if(target_node)
                {
                    session.onExecutionProgress( target_node, event.std, event.data, event.time );
                    if(this.onNodeStateUpdate)
                        this.onNodeStateUpdate(target_node);
                }
                break;
            case "ACTION_FINISHED": 
                if(target_node)
                    session.onExecutionDone( target_node, event.data );
                break;
            default: console.warn("unknown action", event.type);
        }
    }

    playSession( session, finish_callback )
    {
        //already available
        if( this.sessions[ session.id ] )
            this.killSession( session );
        this.sessions[ session.id ] = session;
        var graph_data = session.graph.serialize();
        this.send({ type:"NEW_SESSION", session_id: session.id, data: graph_data }); //wait for session ready
        session.finish_callback = finish_callback || null;
    }

    killSession( session )
    {
        this.send({ type:"KILL_SESSION", session_id: session.id });
        delete this.sessions[ session.id ];
    }

    sessionReady(session_id)
    {
        var session = this.sessions[session_id];
        if(!session)
            return;
        //execute first node
        session.start();
        this.executeNode(session.start_node);
    }

    //send signal to backed to execute
    executeNode(node)
    {
        var session = node.graph.session;
        var action = node.constructor.info.name;
        this.send({ 
            type:"START_ACTION",
            session_id: session.id,
            node_id: node.id,
            action: action,
            params: node.params || {}
        });
    }

    findNode( session_id, node_id )
    {
        var session = this.sessions[session_id];
        if(!session)
            return null;
        return session.graph.getNodeById( node_id );
    }
}

//shows graph editor in the screen
class Editor {
    constructor( container )
    {
        if(!container)
            container = document.body;
        else if(container.constructor === String)
            container = document.querySelector(container);
        if(!container)
            throw("container passed to editor is null");
        this.container = container;
        this.createHTML( container );

        this.backend = new BackendClient();
        this.backend.loadConfig().then(()=>this.onReady())
        this.backend.onNodeStateUpdate = this.onNodeStateUpdate.bind(this);

        this.session = new Session(this.backend);

        //prepare interface
        this.graphcanvas = new LGraphCanvas( this.root.querySelector("canvas"), null );
        this.graphcanvas.resize();
        this.graphcanvas.autoresize = true;
        this.graphcanvas.onShowNodePanel = this.showNodeView.bind(this);

        this.current_view_node = null;

        window.onbeforeunload=function(){
            return "Are you sure to leave this page?";
        }
    }

    createHTML(container)
    {
        var code = `<div class="header">
            <h1>VACIo</h1>
            <span class="tools">
            <button class="play">Play</button>
            </span>
        </div>
        <div class="workarea">
            <div class='section graph litegraph'>
                <div class='canvas-area'><canvas></canvas></div>
                <div class='files-area'><div class='toolbar'><button class='refresh'>Refresh</button></div><div class='files-list'></div></div>
            </div>
            <div class='section node-view hidden'><div class='node-info'>
                    <div class='toolbar'><button class='run'>Run</button>
                    <button class='exit'>Exit</button></div>
                    <h2 class='node-type'>Node</h2>
                    <div class='node-desc'></div>
                    <h2>Parameters</h2>
                    <div class='params-list'></div>
                </div><div class='node-log'>
                node log
                </div></div>
        </div>
        `;
        var root = this.root = document.createElement("div");
        root.classList.add("vicio-editor");
        root.innerHTML = code;
        container.appendChild(root);

        this.root.querySelector("button.play").onclick = this.playSession.bind(this);
        this.root.querySelector("button.exit").onclick = ()=>{this.showNodeView()};
        this.root.querySelector("button.run").onclick = ()=>{this.runCurrentNode()};
        this.root.querySelector("button.refresh").onclick = ()=>{this.refreshFilesView()};
    }

    connect(url)
    {
        this.backend.connect( "ws://" + (url || location.host) )
        .then(()=>console.log("connected!!!"));
    }

    onReady()
    {
        this.session.init();
        this.graphcanvas.setGraph( this.session.graph );
    }

    playSession()
    {
        var button = this.root.querySelector("button.play");
        button.classList.add("working");
        button.innerText = "Stop";
        this.backend.playSession( this.session, this.onSessionFinished.bind(this) );

    }

    showNodeView( node )
    {
        if(!node)
        {
            this.showSection("graph");
            return;
        }

        if(!node.params)
            node.params = {};
        var action_info = node.constructor.info;

        //add info
        this.root.querySelector("h2.node-type").innerText = action_info.name;
        this.root.querySelector(".node-desc").innerText = action_info.desc;

        //add widgets
        var params_container = this.root.querySelector(".params-list");
        params_container.innerText = "";
        if(action_info.params)
        for(var i in action_info.params)
        {
            var elem = document.createElement("div");
            elem.classList.add("param");
            elem.innerHTML = "<span class='label'></span><span class='value'><input /></span>";
            params_container.appendChild(elem);
            var label = elem.querySelector(".label");
            label.innerText = i;
            var input = elem.querySelector("input");
            input.param = i;
            input.value = node.params[i] || "";
            input.addEventListener("change",function(e){
                node.params[ this.param ] = e.target.value;
            });
        }

        //update log
        this.refreshNodeView(node);
        this.showSection("node-view");
    }

    runCurrentNode()
    {
        var node = this.current_view_node;
        this.backend.executeNode(node);
    }

    refreshNodeView(node)
    {
        this.current_view_node = node;

        //log
        var log_area = this.root.querySelector(".workarea .node-log");
        log_area.innerText = "";
        if(node.log)
        for(var i = 0; i < node.log.length; ++i)
        {
            var msg = node.log[i];
            var pre = document.createElement("div");
            pre.classList.add("log-entry");
            pre.innerHTML = "<span class='time'></span><span class='content'></span>";
            var d = new Date(msg.timestamp);
            var time = padTo2Digits(d.getHours())+":"+padTo2Digits(d.getMinutes())+":"+padTo2Digits(d.getSeconds());
            pre.querySelector(".time").innerText = time;
            pre.querySelector(".content").innerText = msg.data;
            if(msg.std)
                pre.classList.add(msg.std);
            log_area.appendChild(pre);
        }
    }

    refreshFilesView( folder = "" )
    {
        var that = this;
        if(folder == "..")
            folder = "";
        var files_area = this.root.querySelector(".files-area .files-list");
        this.current_folder = folder;
        return fetch("./session/"+this.session.id+"?folder="+folder).then(resp=>resp.json()).then((json)=>{
            if(!json.files)
                return;
            files_area.innerText = "";
            addFile({name:".."},".");
            for(var i in json.files)
            {
                var file = json.files[i];
                addFile(file,file.isDir ? this.current_folder + "/" + file.name : null);
            }
        });

        function addFile(file,target)
        {
            var filename = file.name;
            var pre = document.createElement("div");
            pre.classList.add("file-entry");
            pre.innerHTML = "<span class='name'></span>";
            pre.querySelector(".name").innerText = filename;
            files_area.appendChild(pre);
            if(target)
            {
                pre.dataset["target"]=target;
                pre.classList.add("folder");
                pre.onclick = function(){ 
                    that.refreshFilesView( this.dataset["target"] );
                }
            }
            return pre;
        }
    }

    onNodeStateUpdate(node)
    {
        if(this.current_view_node == node)
            this.refreshNodeView(node);
    }

    showSection( name )
    {
        var sections = this.root.querySelectorAll(".workarea .section");
        for(var i = 0; i < sections.length; ++i)
            sections[i].classList.add("hidden");
        var section = this.root.querySelector(".workarea .section." + name);
        if(section)
            section.classList.remove("hidden");
        if(name == "graph")
            this.graphcanvas.resize();
    }

    //called from playSession callback
    onSessionFinished(had_error)
    {
        var button = this.root.querySelector("button.play");
        button.classList.remove("working");
        button.innerText = "Play";
        setTimeout(()=>alert("Session Finished"),100);
    }
};


function generateId(length=32) {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    while (length--)
      result += characters.charAt(Math.floor(Math.random() * characters.length));
    return result;
}

function padTo2Digits(num) { return String(num).padStart(2, '0'); }

export { Editor, Session, BackendClient }