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


// Game ------------------------------------------------------------------------
// -----------------------------------------------------------------------------
function Game(client) {
    this.$ = client;
};

Game.prototype.onConnect = function(success) {
};

Game.prototype.onWebSocketError = function() {
};

Game.prototype.onInit = function(data) {
};

Game.prototype.onUpdate = function(data) {
};

Game.prototype.onRender = function() {
};

Game.prototype.onQuit = function(clean) {
};

Game.prototype.getTime = function() {
    return this.$.getTime();
};

Game.prototype.send = function(msg) {
    this.$.send(msg);
};


// Client ----------------------------------------------------------------------
// -----------------------------------------------------------------------------
function Client(fps) {
    this.conn = null;
    this.connected = false;
    this.lastState = '';
    this.id = '';
    
    this.intervalTime = 0;
    this.interval = null;
    this.intervalSteps = 0;
    this.fpsTime = Math.round(1000 / fps);
    
    this.actors = {};
    this.actorTypes = {};
    
    this.$g = new Game(this);
};

Client.prototype.connect = function(host, port) {
    if (!window['WebSocket']) {
        this.$g.onWebSocketError();
        return;
    }
    
    var that = this;
    this.conn = new WebSocket('ws://' + host + ':' + port);
    this.conn.onopen = function() {
        that.connected = true;
        that.$g.onConnect(true);
    };
    
    this.conn.onmessage = function(msg) {
        try {
            msg = JSON.parse('[' + msg.data.replace(/([a-z0-9]+)\:/gi, '"$1":') + ']');
            
        } catch(e) {
            try {
                console.log('JSON Error:', msg);
            } catch(e) {
                
            }
            return;
        }
        
        // Game
        var type = msg[0];
        var data = msg[1];
        if (type == 's') {
            that.id = data.i;
            that.lastFrame = that.lastRender = that.getTime();
            
            that.intervalTime = data.n;
            that.intervalSteps = Math.floor(that.intervalTime / 10) - 1;
            that.interval = setInterval(function() {that.render()}, 10);
            
            that.$g.onInit(data.d);
        
        } else if (type == 'f') {
            that.$g.onUpdate(data);
        
        } else if (type == 'e') {
            
            
        // Actors
        } else if (type == 'i') {
            for(var i = 0, l = data.a.length; i < l; i++) {
                var a = data.a[i];
                that.actors[a[0][1]] = new Actor(that, a);
            }
        
        } else if (type == 'u') {
            for(var i = 0, l = data.a.length; i < l; i++) {
                var a = data.a[i];
                if (that.actors[a[0][1]]) {
                    that.actors[a[0][1]].update(a);
                }
            }
        
        } else if (type == 'c') {
            that.actors[data[0][1]] = new Actor(that, data);
        
        } else if (type == 'n') {
            that.actors[data[0]].event(data[1], data.length > 2 ? data[2] : {});
        
        } else if (type == 'd') {
            that.actors[data[0]].destroy(data[1], data[2]);
            delete that.actors[data[0]];
        }
    };
    
    this.conn.onerror = this.conn.onclose = function(e) {
        if (that.connected) {
            that.quit();
            that.$g.onQuit(true);
        
        } else {
            that.$g.onConnect(false);
        }
    };
    
    window.onbeforeunload = window.onunload = function() {
        that.conn.close();
    };
}

Client.prototype.quit = function() {
    clearInterval(this.interval);
    for(var i in this.actors) {
        this.actors[i].destroy();
    }
};

Client.prototype.update = function() {
    var currentFrame = this.getTime();
    while(this.lastFrame <= currentFrame) {
        this.renderFrame(currentFrame);
        this.lastFrame += 10;
    }
};

Client.prototype.render = function() {
    var render = this.getTime() - this.lastRender > this.fpsTime;
    if (render) {
        this.lastRender = this.getTime();
        var msg = JSON.stringify(this.$g.onControl());
        if (msg != this.lastState) {
            this.conn.send(msg);
            this.lastState = msg;
        }
        this.$g.onRender();
    }
    
    // interval actors
    for(var c in this.actors) {
        var a = this.actors[c];
        a.x += a.mx / this.intervalSteps;
        a.y += a.my / this.intervalSteps;
        this.actorTypes[a.clas].interleave.call(a);
        
        if (render) {
            this.actorTypes[a.clas].render.call(a);
        }
    }
};

Client.prototype.createActorType = function(id) {
    function ActorType() {
        this.create = function(data) {};
        this.update = function(data) {};
        this.interleave = function() {};
        this.render = function() {};
        this.event = function(type, data) {};
        this.destroy = function() {};
        return this;
    }
    this.actorTypes[id] = new ActorType();
    return this.actorTypes[id];
};

Client.prototype.send = function(msg) {
    this.conn.send(JSON.stringify(msg));
};

Client.prototype.getTime = function() {
    return new Date().getTime();
};


// Actors ----------------------------------------------------------------------
// -----------------------------------------------------------------------------
function Actor(game, data) {
    this.$ = game;
    this.$g = game.$g;
    
    var d = data[0]
    this.clas = d[0];
    this.id = d[1];
    
    this.x = d[2];
    this.y = d[3];
    this.mx = d[4];
    this.my = d[5];
    
    this.$.actorTypes[this.clas].create.call(this, data[1]);
}

Actor.prototype.update = function(data) {
    var d = data[0];
    this.x = d[2];
    this.y = d[3];
    this.mx = d[4];
    this.my = d[5];
    
    this.$.actorTypes[this.clas].update.call(this, data[1]);
};

Actor.prototype.event = function(type, data) {
    this.$.actor_types[this.clas].event.call(this, type, data);
};

Actor.prototype.destroy = function(x, y) {
    this.x = x;
    this.y = y;
    this.$.actorTypes[this.clas].destroy.call(this);
};

