
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
        graph.add(node_start);

        var node = LiteGraph.createNode("actions/sleep");
        node.pos = [600, 200];
        graph.add(node);
        
        var node_finish = LiteGraph.createNode("actions/finish");
        node_finish.pos = [1000, 200];
        node_finish.removable = true;
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
            this.graph._nodes[i].boxcolor = null;
    }

    //received when started
    onExecutionStarted(node,data)
    {
        this.current_node = node;
        node.boxcolor = "#FFaa00";
    }

    //in case the action outputs to some pipe
    onExecutionProgress(node,data)
    {
        console.log("std",data);
    }

    //in case the action outputs to some pipe
    onExecutionError(node,data)
    {
        node.boxcolor = "#FF0000";
    }   

    //received when done (data:{stdout,stderr,code})
    onExecutionDone(node,data)
    {
        console.log("done:",data);
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
            this.color = this.in_execution ? "#353" : null;
            this.bgcolor = this.in_execution ? "#131" : null;
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
                    session.onExecutionError( target_node, event.data );
                break;
            case "ACTION_PROGRESS": 
                if(target_node)
                    session.onExecutionProgress( target_node, event.data );
                break;
            case "ACTION_FINISHED": 
                if(target_node)
                {
                    target_node.in_execution = false;
                    session.onExecutionDone( target_node, event.data );
                }
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
        this.send({ type:"NEW_SESSION", session_id: session.id }); //wait for session ready
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
        node.in_execution = true;
        this.send({ 
            type:"START_ACTION",
            session_id: session.id,
            node_id: node.id,
            action: action,
            params: [] //TODO
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
            throw("container not found");
        this.container = container;
        this.backend = new BackendClient();
        this.backend.loadConfig().then(()=>this.onReady())

        this.session = new Session(this.backend);

        //prepare interface
        this.graphcanvas = new LGraphCanvas( container, null );
        this.graphcanvas.resize();
        this.graphcanvas.autoresize = true;

        document.body.querySelector("#play").onclick = this.playSession.bind(this);
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
        var button = document.body.querySelector("#play");
        button.classList.add("working");
        button.innerText = "Stop";
        this.backend.playSession( this.session, this.onSessionFinished.bind(this) );

    }

    //called from playSession callback
    onSessionFinished()
    {
        var button = document.body.querySelector("#play");
        button.classList.remove("working");
        button.innerText = "Play";
        alert("Session Finished");
    }
};


function generateId(length=32) {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    while (length--)
      result += characters.charAt(Math.floor(Math.random() * characters.length));
    return result;
}


export { Editor, Session, BackendClient }