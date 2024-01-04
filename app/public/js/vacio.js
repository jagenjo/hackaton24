
//namespace
var VACIO = {}

//represents one session from one user
class Session {
    constructor()
    {
        this.id = generateId();
        this.graph = new LGraph();
        this.start_node = null;
        this.finish_node = null;
    }

    init()
    {
        var graph = this.graph;
        var node_start = LiteGraph.createNode("actions/start");
        node_start.pos = [200, 200];
        node_start.removable = true;
        graph.add(node_start);
        
        var node_finish = LiteGraph.createNode("actions/finish");
        node_finish.pos = [700, 200];
        node_finish.removable = true;
        graph.add(node_finish);

        node_start.connect(0, node_finish, 0);

        this.start_node = node_start;
        this.finish_node = node_finish;
    }
}

//connects to backend to execute stuff remotely
class BackendClient {
    constructor()
    {
        this.config = {};
        this.sessions = {}
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
    
    buildNodeClassFromInfo(info)
    {
        //define node here
        function nodeExec(_in){} //empty place holder
        var node_class = LiteGraph.wrapFunctionAsNode("actions/" + info.name, nodeExec,[LiteGraph.ACTION],LiteGraph.EVENT);
        node_class.prototype.onAction = onNodeAction;
        node_class.info = info;

        function onNodeAction(e)
        {
            if(e == "_in")
                this.graph.backend.startExecution(this);
            else if(e == "end")
                this.triggerSlot(0);
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
            
        var event = JSON.parse( msg.data );
        var target_node = null;
        if(event.session_id != null && event.node_id != null )
        target_node = this.findNode( event.session_id, event.node_id );

        switch(event.type)
        {
            case "SESSION_READY": 
                this.sessionReady( event.session_id );
                break;
            case "ACTION_STARTED": 
                if(target_node)
                    this.onExecutionStarted( target_node, event.data );
                break;
            case "ACTION_HALTED": 
                if(target_node)
                    this.onExecutionHalted( target_node, event.data );
                break;
            case "ACTION_PROGRESS": 
                if(target_node)
                    this.onExecutionProgress( target_node, event.data );
                break;
            case "ACTION_FINISHED": 
                if(target_node)
                    this.onExecutionDone( target_node, event.data );
                break;
            default: console.warn("unknown action", event.type);
        }
    }

    playSession( session )
    {
        //already available
        if( this.sessions[ session.id ] )
            this.killSession( session );
        this.sessions[ session.id ] = session;
        this.send({ type:"NEW_SESSION", session_id: session.id }); //wait for session ready
    }

    killSession( session )
    {
        this.send({ type:"KILL_SESSION", session_id: session.id }); //wait for session ready
        delete this.sessions[ session.id ];
    }

    sessionReady(session_id)
    {
        var session = this.sessions[session_id];
        if(!session)
            return;
        //execute first node
        this.startExecution(session.start_node,session);
    }

    //send signal to backed to execute
    startExecution(node,session)
    {
        var action = node.constructor.info.name;
        this.send({ 
            type:"START_ACTION",
            session_id: session.id,
            node_id: node.id,
            action: action,
            params: [] //TODO
        });
        this.current_node = node;
    }

    findNode( session_id, node_id )
    {
        var session = this.sessions[session_id];
        if(!session)
            return null;
        return session.graph.getNodeById( node_id );
    }

    //received when started
    onExecutionStarted(node,data)
    {
        node.boxcolor = "orange";
    }

    //in case the action outputs to some pipe
    onExecutionProgress(node,data)
    {
    }

    //in case the action outputs to some pipe
    onExecutionHalted(node,data)
    {
        node.boxcolor = "red";
    }   

    //received when done
    onExecutionDone(node,data)
    {
        node.boxcolor = "green";
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

        this.session = new Session();

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
        this.backend.playSession( this.session );
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