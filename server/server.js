/*
  
  NodeGame: Shooter
  Copyright (c) 2010 Ivo Wetzel.
  
  All rights reserved.
  
  NodeGame: Shooter is free software: you can redistribute it and/or
  modify it under the terms of the GNU General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  NodeGame: Shooter is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public License along with
  NodeGame: Shooter. If not, see <http://www.gnu.org/licenses/>.
  
*/


var ws = require(__dirname + '/lib/ws');
var sys = require('sys');

// Message types
var MSG_GAME_START = 1;
var MSG_GAME_FIELDS = 2;
var MSG_GAME_SHUTDOWN = 3;

var MSG_ACTORS_INIT = 4;
var MSG_ACTORS_CREATE = 5;
var MSG_ACTORS_UPDATE = 6;
var MSG_ACTORS_REMOVE = 7;
var MSG_ACTORS_DESTROY = 8;


// Server ----------------------------------------------------------------------
// -----------------------------------------------------------------------------
function Server(port, maxClients, maxChars) {
    this.maxChars = maxChars || 128;
    this.maxClients = maxClients || 64;
    this.port = port;
    
    // Server
    this.fields = {};
    this.fieldsChanged = false;
    this.logs = []; 
    
    // Client
    this.client = {};
    this.clientCount = 0;
    this.clients = {};
    this.clientID = 0;
    
    // Actors
    this.actorCount = 0;
    this.actorID = 0;
    this.actorTypes = {};
    this.actors = {};
    
    this.bytesSend = 0;
    this.bytesSendLast = 0;
    
    // Socket
    var that = this;
    this.$ = ws.createServer();   
    this.$.addListener('connection', function(conn) {
        if (this.clientCount >= this.maxClients) {
            conn.close();
            return;
        }
        
        var id = that.addClient(conn);
        conn.addListener('message', function(msg) {
            if (msg.length > that.maxChars) {
                that.log('!! Message longer than ' + that.maxChars + ' chars');
                conn.close();
            
            } else {
                try {
                    that.clients[id].onMessage(JSON.parse(msg));
                
                } catch (e) {
                    that.log('!! Error: ' + e);
                    conn.close();
                }
            }
        });
        
        conn.addListener('close', function(conn) {
            that.removeClient(id);
        });
    });
    
    // Hey Listen!
    this.$.listen(this.port);
}
exports.Server = Server;


// General ---------------------------------------------------------------------
Server.prototype.run = function() {
    var that = this;
    process.nextTick(function() {
        that.start();
    });
};

Server.prototype.start = function() {
    var that = this;
    for(var i in this.actorTypes) {
        this.actors[i] = []; 
    }
    this.startTime = new Date().getTime();
    this.time = new Date().getTime();
    this.log('>> Server started');
    this.$g.start();
    this.status();
    process.addListener('SIGINT', function(){that.shutdown()});
};


Server.prototype.shutdown = function() {
    this.log('>> Shutting down...');
    this.status(true);
    this.$g.running = false;
    this.destroyActors();
    this.emit(MSG_GAME_SHUTDOWN, []);
    
    var that = this;
    setTimeout(function() {
        sys.print('\x1b[u\n');
        
        for(var c in that.clients) {
            that.clients[c].close();
        }
        process.exit(0);
    }, 100);
};

Server.prototype.Game = function(interval) {
    this.$g = new Game(this, interval);
    return this.$g;
};

Server.prototype.Client = function() {
    return this.client;
};


// Helpers ---------------------------------------------------------------------
Server.prototype.getTime = function() {
    return this.time;
};

Server.prototype.timeDiff = function(time) {
    return this.time - time;
};

Server.prototype.log = function(str) {
    this.logs.push([this.getTime(), str]);
    if (this.logs.length > 18) {
        this.logs.shift();
    }
};

Server.prototype.status = function(end) {
    var that = this;
    function toTime(time) {
        var t = Math.round((time - that.startTime) / 1000);
        var m = Math.floor(t / 60);
        var s = t % 60;
        return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    }
    
    function toSize(size) {
        var t = 0;
        while(size >= 1024 && t < 2) {
            size = size / 1024;
            t++;
        }
        return Math.round(size * 100) / 100 + [' bytes', ' kib', ' mib'][t];
    }
    
    var stats = '    Running ' + toTime(this.time) + ' | '
                + this.clientCount
                + ' Client(s) | ' + this.actorCount + ' Actor(s) | '
                + toSize(this.bytesSend)
                + ' send | '
                + toSize((this.bytesSend - this.bytesSendLast) * 2)
                + '/s\n';
    
    this.bytesSendLast = this.bytesSend;
    for(var i = this.logs.length - 1; i >= 0; i--) {
        stats += '\n      ' + toTime(this.logs[i][0])
                 + ' ' + this.logs[i][1];
    }
    sys.print('\x1b[H\x1b[J# NodeGame Server at port '
              + this.port + '\n' + stats + '\n\x1b[s\x1b[H');
    
    if (!end) {
        setTimeout(function() {that.status(false)}, 500);
    }
};


// Clients ---------------------------------------------------------------------
Server.prototype.addClient = function(conn) {
    this.clientID += 1;
    this.clients[this.clientID] = new Client(this, conn);
    this.clientCount++;
    return this.clientID;
};

Server.prototype.removeClient = function(id) {
    if (this.clients[id]) {
        this.clientCount--;
        this.clients[id].onRemove();
        delete this.clients[id];
    }
};

Server.prototype.updateClients = function() {
    for(var c in this.clients) {
        this.clients[c].onUpdate();
    }
};


// Messaging -------------------------------------------------------------------
Server.prototype.send = function(conn, type, msg) {
    msg.unshift(type);
    
    var e = this.toJSON(msg);
    conn.write(e);
    this.bytesSend += e.length;
};

Server.prototype.emit = function(type, msg) {
    msg.unshift(type);
    
    var e = this.toJSON(msg);
    this.$.broadcast(e);
    this.bytesSend += e.length * this.clientCount;
};

Server.prototype.toJSON = function(data) {
    var msg = JSON.stringify(data);
    msg = msg.substring(1).substring(0, msg.length - 2);
    return msg.replace(/\"([a-z0-9]+)\"\:/gi, '$1:');;
};


// Actors ----------------------------------------------------------------------
Server.prototype.createActor = function(clas, data) {
    var a = new Actor(this, clas, data, null);
    this.actors[clas].push(a);
    return a;
};

Server.prototype.createActorType = function(id) {
    function ActorType() {
        this.create = function(data) {};
        this.update = function() {};
        this.destroy = function() {};
        this.msg = function(full) {return {};};
    }
    this.actorTypes[id] = new ActorType();
    return this.actorTypes[id];
};

Server.prototype.getActors = function(clas) {
    return this.actors[clas];
};

Server.prototype.updateActors = function() {
    this.actorCount = 0;
    for(var t in this.actors) {
        var alive_actors = [];
        for(var i = 0, l = this.actors[t].length; i < l; i++) {
            var a = this.actors[t][i];
            if (a.alive) {
                a.update();
            }
            if (a.alive) {
                if (a.updated) {
                    a.emit(MSG_ACTORS_UPDATE);
                    a.updated = false;
                
                } else {
                    a.emit(MSG_ACTORS_INIT);
                }
                alive_actors.push(a);
            }
        }
        this.actors[t] = alive_actors;
        this.actorCount += this.actors[t].length;
    }
    
    // Send messages
    for(var i in this.clients) {
        var c = this.clients[i];
        if (c.initMessages.length > 0) {
            c.send(MSG_ACTORS_INIT, c.initMessages);
            c.initMessages = [];
        }
        
        if (c.createMessages.length > 0) {
            c.send(MSG_ACTORS_CREATE, c.createMessages);
            c.createMessages = [];
        }
        
        if (c.updatesMessages.length > 0) {
            c.send(MSG_ACTORS_UPDATE, c.updatesMessages);
            c.updatesMessages = [];
        }
        
        if (c.removeMessages.length > 0) {
            c.send(MSG_ACTORS_REMOVE, c.removeMessages);
            c.removeMessages = [];
        }  
        
        if (c.destroyMessages.length > 0) {
            c.send(MSG_ACTORS_DESTROY, c.destroyMessages);
            c.destroyMessages = [];
        }
    }
};

Server.prototype.destroyActors = function() {
    for(var t in this.actors) {
        for(var i = 0, l = this.actors[t].length; i < l; i++) {
            this.actors[t][i].destroy();
        }
    }
};


// Fields ----------------------------------------------------------------------
Server.prototype.setField = function(key, value, send) {
    this.fields[key] = value;
    if (send !== false) {
        this.fieldsChanged = true;
    }
};

Server.prototype.setFieldItem = function(key, item, value, send) {
    this.fields[key][item] = value;
    if (send !== false) {
        this.fieldsChanged = true;
    }
};

Server.prototype.getField = function(key) {
    return this.fields[key];
};

Server.prototype.delField = function(key) {
    if (this.fields[key]) {
        delete this.fields[key];
        this.fieldsChanged = true;
    } 
};

Server.prototype.delFieldItem = function(key, item) {
    if (this.fields[key][item]) {
        delete this.fields[key][item];
        this.fieldsChanged = true;
    } 
};

Server.prototype.updateFields = function(mode) {
    if (mode) {
        this.fieldsChanged = true;
    
    } else if (this.fieldsChanged) {
        this.emit(MSG_GAME_FIELDS, [this.fields]);
        this.fieldsChanged = false;
    }
};

Server.prototype.emitFields = function(mode) {
    this.emit(MSG_GAME_FIELDS, [this.fields]);
    this.fieldsChanged = false;
};


// Game ------------------------------------------------------------------------
// -----------------------------------------------------------------------------
function Game(srv, interval) {
    this.$ = srv;
    this.interval = interval;
}

Game.prototype.start = function() {
    this._lastTime = this.$.time;
    this.running = true;
    this.onInit();
    this.run();
};

Game.prototype.run = function() {
    if (this.running) {
        this.$.updateFields(false);
        this.$.time = new Date().getTime();
        while(this._lastTime <= this.$.time) {
            this.$.updateClients();
            this.$.updateActors();
            this.onUpdate(); 
            this._lastTime += this.interval;
        }
        
        var that = this;
        setTimeout(function(){that.run();}, 5);
    }
};

Game.prototype.onInit = function() {
};

Game.prototype.onUpdate = function() {
};

// Helpers
Game.prototype.getTime = function() {
    return this.$.time;
};

Game.prototype.log = function(str) {
    this.$.log(str);
};

Game.prototype.timeDiff = function(time) {
    return this.$.timeDiff(time);
};

Game.prototype.getActors = function(clas) {
    return this.$.getActors(clas);
};

Game.prototype.createActor = function(clas, data) {
    this.$.createActor(clas, data);
};


// Clients ---------------------------------------------------------------------
// -----------------------------------------------------------------------------
function Client(srv, conn) {
    this.$ = srv;
    this.$g = srv.$g;
    this.conn = conn;
    this.id = this.$.clientID;
    this.actors = [];
    
    this.initMessages = [];
    this.createMessages = [];
    this.updatesMessages = [];
    this.removeMessages = [];
    this.destroyMessages = [];
    
    this.send(MSG_GAME_START, [this.id, this.$g.interval, this.$.fields]);
    for(var t in this.$.actors) {
        for(var i = 0, l = this.$.actors[t].length; i < l; i++) {
            this.$.actors[t][i].emit(MSG_ACTORS_INIT);
        }
    }
    
    // Extend
    for(var m in this.$.client) {
        this[m] = this.$.client[m];
    }
    this.onInit();
}

Client.prototype.send = function(type, msg) {
    this.$.send(this.conn, type, msg);
};

Client.prototype.close = function() {
    this.conn.close();
};

Client.prototype.onInit = function() {
};

Client.prototype.onMessage = function(msg) {
};

Client.prototype.onUpdate = function() {
};

Client.prototype.onRemove = function() {
};


// Helpers
Client.prototype.log = function(str) {
    this.$.log(str);
};

Client.prototype.getInfo = function() {
    return this.conn.id;
}

Client.prototype.getTime = function() {
    return this.$.getTime();
};

Client.prototype.timeDiff = function(time) {
    return this.$.timeDiff(time);
};


// Actors ----------------------------------------------------------------------
// -----------------------------------------------------------------------------
function Actor(srv, clas, data) {
    this.$ = srv;
    this.$g = srv.$g;
    this.id = ++this.$.actorID;
    this.clas = clas;
    this.x = 0;
    this.y = 0;
    this.mx = 0;
    this.my = 0;
    
    this.clients = [];
    this.alive = true;
    this.updated = false;
    
    // Extend
    for(var m in this.$.actorTypes[this.clas]) {
        if (m != 'destroy') {
            this[m] = this.$.actorTypes[this.clas][m];
        }
    }
    this.create(data);
    this.emit(MSG_ACTORS_CREATE);
}

Actor.prototype.emit = function(type) {
    for(var i in this.$.clients) {
        var c = this.$.clients[i];
        var index = c.actors.indexOf(this.id);
        
        if (this.clients.length == 0 || this.clients.indexOf(c.id) != -1) {
            
            // Destroy
            if (type == MSG_ACTORS_DESTROY) {
                if (index == -1) {
                    c.actors.push(this.id);
                    c.initMessages.push(this.toMessage(true));
                    this.updated = true;
                }
                c.actors.splice(index, 1);
                c.destroyMessages.push([this.id, Math.round(this.x),
                                                 Math.round(this.y)]);
            
            // Update AND init
            } else if (type == MSG_ACTORS_UPDATE) {
                if (index == -1) {
                    c.actors.push(this.id);
                    c.initMessages.push(this.toMessage(true));
                }
                c.updatesMessages.push(this.toMessage(false));
            
            // Create
            } else if (type == MSG_ACTORS_CREATE && index == -1) {
                c.actors.push(this.id);
                c.createMessages.push(this.toMessage(true));
                this.updated = true;
            
            // Init
            } else if (type == MSG_ACTORS_INIT && index == -1) {
                c.actors.push(this.id);
                c.initMessages.push(this.toMessage(true));
                this.updated = true;
            }
        
        // Remove
        } else if (this.clients.indexOf(c.id) == -1 && index != -1) {
            c.actors.splice(index, 1);
            c.removeMessages.push([this.id]);
        }
    }
};

Actor.prototype.destroy = function() {
    if (this.alive) {
        this.alive = false;
        this.$.actorTypes[this.clas].destroy.call(this);
        this.emit(MSG_ACTORS_DESTROY);
    }
};

Actor.prototype.event = function(type, data) {
    var msg = [this.id, type];
    if (data) {
        msg.push(data);
    }
    this.$.emit(MSG_ACTORS_EVENT, msg);
};

Actor.prototype.toMessage = function(full) {
    var raw = [
        this.id,
        Math.round(this.x * 100) / 100,  Math.round(this.y * 100) / 100,
        Math.round(this.mx * 100) / 100, Math.round(this.my * 100) / 100
    ];
    if (full) {
        raw.push(this.clas);
    }
    
    var msg = [raw];
    var d = this.msg(full);
    if (d.length > 0) {
        msg.push(d);
    }
    return msg;
};

// Helpers
Actor.prototype.log = function(str) {
    return this.$.log(str);
};

Actor.prototype.getTime = function() {
    return this.$.getTime();
};

Actor.prototype.timeDiff = function(time) {
    return this.$.timeDiff(time);
};

