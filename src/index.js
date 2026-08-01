/********************************************************************************
 * Copyright (C) 2023 CoCreate and Contributors.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 ********************************************************************************/

/**
 * Commercial Licensing Information:
 * For commercial use of this software without the copyleft provisions of the AGPLv3,
 * you must obtain a commercial license from CoCreate LLC.
 * For details, visit <https://cocreate.app/licenses/> or contact us at sales@cocreate.app.
 */

import { ObjectId, uuid, getClientInfo } from "@cocreate/utils";
import config from "@cocreate/config";

const isBrowser = typeof window !== "undefined";
let WS_Impl;
let indexeddb = null;

if (isBrowser) {
    import("../../../CoCreate-storages/CoCreate-indexeddb/src")
        .then((mod) => {
            indexeddb = mod.default || mod;
            if (CoCreateSocketClient.clientId && CoCreateSocketClient.clientId.length !== 24 && ObjectId) {
                CoCreateSocketClient.clientId = ObjectId().toString();
                config.set("clientId", CoCreateSocketClient.clientId);
            }
        })
        .catch((err) => {
            console.warn("[@cocreate/socket-client] Safe Dynamic Fallback: Browser storage engine failed to load.", err);
        });
}

async function getWebSocketImpl() {
    if (WS_Impl) return WS_Impl;
    if (isBrowser) {
        WS_Impl = window.WebSocket;
    } else {
        const wsModule = await import("ws");
        WS_Impl = wsModule.default || wsModule;
    }
    return WS_Impl;
}

const socketsByUrl = new Map();
const socketsById = new Map();
const delay = 1000 + Math.floor(Math.random() * 3000);

let organizationPromise = null;

async function getOrganization() {
    let organization_id = config.get("organization_id");
    if (!organization_id || organization_id === "canceled") {
        if (isBrowser) {
            const Organization = await import("@cocreate/organizations");
            organization_id = await Organization.default.get();
        } else {
            organization_id = process.env.ORGANIZATION_ID || "";
        }
    }
    if (organization_id) config.set("organization_id", organization_id);

    return organization_id;
}

const CoCreateSocketClient = {
    frameId: uuid(8),
    connected: false,
    listeners: new Map(),
    messageEvents: {},
    messageQueue: new Map(), 
    configQueue: new Map(),
    maxReconnectDelay: 600000,
    organization: false, 
    serverStorage: true, 
    serverOrganization: true, 
    organizationBalance: true, 
    organization_id: async () => {
        return (
            organizationPromise ||
            (organizationPromise = getOrganization())
        );
    },

    async init() {
        this.clientId = config.get("clientId");
        this.clientInfo = await getClientInfo();
        if (!this.clientId || this.clientId === "undefined") {
            this.clientId = ObjectId().toString() 
            config.set("clientId", this.clientId);
        }

        // Strictly retrieve host using isomorphic config.get
        this.host = config.get("host");
        if (!this.host || this.host === "undefined") {
            if (isBrowser) {
                // Browser: Fall back cleanly to client's current domain
                this.host = window.location.host;
            } else {
                // Server: Leave empty so getUrls can safely report configuration parameters are missing
                this.host = "";
            }
            config.set("host", this.host);
        }

        this.balancer = config.get("balancer");
        if (!this.balancer || this.balancer === "undefined") {
            this.balancer = "";
            config.set("balancer", this.balancer);
        }
    },

    set(socket) {
        socketsByUrl.set(socket.url, socket);
        socketsById.set(socket.id, socket);
    },

    get(key) {
        return socketsByUrl.get(key) || socketsById.get(key);
    },

    has(key) {
        return socketsByUrl.has(key) || socketsById.has(key);
    },

    delete(key) {
        let socket;
        if (typeof key === "string") socket = this.get(key);
        if (!socket || (!socket.id && !socket.url)) return;
        socketsByUrl.delete(socket.url);
        socketsById.delete(socket.id);
        
        if (socket.readyState === 1) socket.close();
    },

    async create(data = {}) {
        const self = this;

        if (this.organization === "canceled") return;

        const urls = await this.getUrls(data);
        for (let url of urls) {
            let socket = this.get(url);
            if (socket) return;

            this.set({ url });

            try {
                let token = null;
                if (isBrowser) {
                    token = config.get("token");
                }

                let socketId;
                if (isBrowser) {
                    socketId = sessionStorage.getItem("socketId");
                }

                if (!socketId) {
                    socketId = uuid(8);
                    if (isBrowser)
                        sessionStorage.setItem("socketId", socketId);
                }

                const options = {
                    socketId,
                    clientId: this.clientId,
                    clientInfo: this.clientInfo,
                    user_id: data.user_id || this.user_id,
                    token: token || ""
                };

                if (isBrowser) {
                    options.lastSynced = config.get(url);
                }

                let opt = JSON.stringify(options);
                opt = encodeURIComponent(opt);

                const WebSocketClass = await getWebSocketImpl();
                socket = new WebSocketClass(url, opt);
                socket.id = options.socketId;
                socket.connected = false;
                socket.clientId = this.clientId;
                socket.frameId = this.frameId;
                socket.organization_id =
                    data.organization_id ||
                    (await this.organization_id());
                socket.user_id = data.user_id || this.user_id;
                socket.host = data.host || this.host;
                socket.key = url;

                this.set(socket);
            } catch (error) {
                console.error("[@cocreate/socket-client] Connection setup failed:", error);
                return;
            }

            socket.onopen = function (event) {
                self.connected = true;
                socket.connected = true;
                delete data.currentReconnectDelay;
                self.checkMessageQueue(data);
            };

            socket.onclose = function (event) {
                socket.connected = false;
                switch (event.code) {
                    case 1000: 
                        console.log("websocket: closed");
                        break;
                    default:
                        self.reconnect(data, socket);
                        break;
                }
            };

            socket.onerror = function (event) {
                if (!isBrowser) console.error("[@cocreate/socket-client] Server socket transport error:", event.error || event);
                else if (!window.navigator.onLine)
                    console.log("offline");

                self.reconnect(data, socket);
            };

            socket.onmessage = function (message) {
                try {
                    message = JSON.parse(message.data);
                    if (message.error) {
                        console.error(message.method, message.error);
                        if (message.serverOrganization === false)
                            self.serverOrganization =
                                self.serverStorage = false;
                        else if (message.serverStorage === false)
                            self.serverStorage = false;
                        else if (message.organizationBalance === false)
                            self.organizationBalance = false;
                    }

                    if (
                        message.method != "connect" &&
                        typeof message == "object"
                    ) {
                        if (isBrowser && message._id) {
                            let lastSynced = config.get(socket.url);

                            if (!lastSynced) {
                                config.set(socket.url, message._id);
                            } else if (lastSynced !== message._id) {
                                if (
                                    ObjectId(lastSynced).timestamp <
                                    ObjectId(message._id).timestamp
                                ) {
                                    config.set(socket.url, message._id);
                                }
                            }

                            let Data = {
                                method: "object.delete",
                                array: "message_log",
                                $filter: {
                                    query: {
                                        "modified.on": {
                                            $gt: message.timestamp
                                        },
                                        status: "queued"
                                    }
                                }
                            };

                            let type = message.method.split(".")[0];
                            if (Array.isArray(message[type])) {
                                for (let item of message[type]) {
                                    if (type == "object") {
                                        Data.$filter.query["data._id"] =
                                            item._id;
                                    } else if (
                                        [
                                            "database",
                                            "array",
                                            "index"
                                        ].includes(type)
                                    ) {
                                        Data.$filter.query[
                                            "data.name"
                                        ] = item.name;
                                    }
                                }
                            }
                        }
                    }

                    if (
                        message.broadcastClient &&
                        message.broadcastBrowser !== false &&
                        isBrowser &&
                        message.broadcastBrowser &&
                        !message.method.endsWith(".read")
                    )
                        config.set(
                            "localSocketMessage",
                            JSON.stringify(message)
                        );

                    message.status = "received";

                    if (message && message.uuid) {
                        if (isBrowser) {
                            const event = new window.CustomEvent(
                                message.uuid,
                                {
                                    detail: message
                                }
                            );
                            window.dispatchEvent(event);
                        } else {
                            process.emit(message.uuid, message);
                        }
                    }

                    self.__fireListeners(message);
                } catch (e) {
                    console.log(e);
                }
            };
        }
    },

    __fireListeners(data) {
        const listeners = this.listeners.get(data.method) || [];
        listeners.forEach((listener) => {
            listener(data);
        });

        if (data.method.includes(".")) {
            const listeners =
                this.listeners.get(data.method.split(".")[0]) || [];
            listeners.forEach((listener) => {
                listener(data);
            });
        }
    },

    checkMessageQueue(config) {
        if (isBrowser && indexeddb) {
            indexeddb
                .send({
                    method: "object.delete",
                    array: "message_log",
                    $filter: {
                        query: { status: "queued" }
                    },
                    organization_id: config.organization_id
                })
                .then((data) => {
                    if (data) {
                        for (let i = 0; i < data.object.length; i++) {
                            this.send(data.object[i].data);
                        }
                    }
                });
        } else {
            if (this.messageQueue.size > 0) {
                for (let [uuid, data] of this.messageQueue) {
                    this.send(data);
                    this.messageQueue.delete(uuid);
                }
            }
        }
    },

    send(data = {}) {
        return new Promise(async (resolve, reject) => {
            data.clientId = this.clientId;
            data.frameId = this.frameId;

            if (!data.timeStamp)
                data.timeStamp = new Date().toISOString();

            if (!data.organization_id)
                data.organization_id = await this.organization_id();

            if (!data.apikey && this.apikey) data.apikey = this.apikey;

            if (!data.user_id && this.user_id)
                data.user_id = this.user_id;

            if (data.broadcast === "false" || data.broadcast === false)
                data.broadcast = false;
            else data.broadcast = true;

            if (
                data.broadcastClient === "false" ||
                data.broadcastClient === false
            )
                data.broadcastClient = false;
            else data.broadcastClient = true;

            if (
                data.broadcastSender === "false" ||
                data.broadcastSender === false
            )
                data.broadcastSender = false;
            else data.broadcastSender = true;

            if (!data.uuid) data.uuid = uuid();

            if (!data.namespace) delete data.namespace;

            if (!data.room) delete data.room;

            let broadcastBrowser = false;
            if (
                data.broadcastBrowser === "false" ||
                data.broadcastBrowser === false
            )
                broadcastBrowser = false;
            else broadcastBrowser = true;

            delete data.broadcastBrowser;

            const UUID = data.uuid;
            const sockets = await this.getSockets(data);

            let isAwait;
            for (let socket of sockets) {
                data.socketId = socket.id;
                if (!this.messageEvents[UUID])
                    this.addListener(UUID, resolve);

                if (
                    socket.connected &&
                    this.serverOrganization &&
                    this.serverStorage &&
                    this.organizationBalance
                ) {
                    if (data.status === "resolve") resolve(data);

                    if (data.status === "await") isAwait = true;

                    delete data.status;

                    socket.send(JSON.stringify(data));
                    data.status = "sent";
                } else if (!data.status) {
                    data.status = "queued";
                } else if (
                    data.status !== "queued" &&
                    data.status !== "await"
                ) {
                    resolve(data);
                }

                if (isBrowser) {
                    if (!isAwait) {
                        if (data.broadcastSender)
                            this.sendLocalMessage(data);

                        if (broadcastBrowser)
                            config.set(
                                "localSocketMessage",
                                JSON.stringify(data)
                            );
                    }

                    if (data.status !== "sent") data.status = "queued";

                    if (indexeddb && data.status === "queued") {
                        indexeddb.send({
                            method: "object.update",
                            array: "message_log",
                            upsert: true,
                            object: {
                                _id: UUID,
                                data,
                                status: "queued"
                            },
                            organization_id: data.organization_id
                        });
                    }
                } else if (!indexeddb && data.status === "queued")
                    this.messageQueue.set(UUID, data);
            }
        });
    },

    addListener(UUID, resolve) {
        this.messageEvents[UUID] = resolve;
        if (isBrowser) {
            const self = this;
            window.addEventListener(
                UUID,
                function (event) {
                    delete self.messageEvents[UUID];
                    resolve(event.detail);
                },
                { once: true }
            );
        } else {
            process.once(UUID, (data) => {
                delete this.messageEvents[UUID];
                resolve(data);
            });
        }
    },

    listen(action, callback) {
        if (!this.listeners.get(action)) {
            this.listeners.set(action, [callback]);
        } else {
            this.listeners.get(action).push(callback);
        }
    },

    reconnect(config, socket) {
        let self = this;
        if (!config.currentReconnectDelay)
            config.currentReconnectDelay = delay;

        let url = socket.url;
        if (isBrowser && !window.navigator.onLine) {
            const online = () => {
                window.removeEventListener("online", online);
                self.delete(url);
                self.create(config);
            };
            window.addEventListener("online", online);
        } else {
            setTimeout(() => {
                if (
                    !self.maxReconnectDelay ||
                    config.currentReconnectDelay <
                        self.maxReconnectDelay
                ) {
                    self.delete(url);
                    config.currentReconnectDelay *= 2;
                    self.create(config);
                }
            }, config.currentReconnectDelay);
        }
    },

    async getUrls(data = {}) {
        let protocol = "wss";
        let host = data.host || config.get("host"); // Strictly resolved via isomorphic configuration
        
        if (!host && isBrowser) {
            host = window.location.host; // Fallback directly to client's browser domain if configuration is empty
        }

        if (isBrowser) {
            if (location.protocol.startsWith("about:")) {
                if (
                    window.parent &&
                    window.parent.location.protocol !== "https:"
                ) {
                    protocol = "ws";
                }
            } else if (location.protocol !== "https:") protocol = "ws";
        } else {
            if (typeof host === "string") {
                if (host.includes("localhost") || host.includes("127.0.0.1")) {
                    protocol = "ws";
                }
            }
        }

        let url,
            urls = [],
            hostUrls = [];
        let balancer = data.balancer || config.get("balancer"); // Strictly resolved via isomorphic configuration
        
        if (typeof host === "string" && host) {
            host = host.split(",");
            for (let i = 0; i < host.length; i++) {
                host[i] = host[i].trim();
                if (host[i][host[i].length - 1] === "/")
                    host[i] = host[i].slice(0, -1);

                if (host[i].includes("://")) url = `${host[i]}`;
                else url = `${protocol}://${host[i]}`;

                url += `/${
                    data.organization_id ||
                    (await this.organization_id()) ||
                    ""
                }`;
                if (balancer == "mesh") urls.push(url);
                else {
                    let socket = this.get(url);
                    if (socket !== false) {
                        urls.push(url);
                        break;
                    } else hostUrls.push(url);
                }
            }
            if (!urls.length && hostUrls.length) {
                for (let i = 0; i < hostUrls.length; i++) {
                    this.delete(hostUrls[i]);
                    urls.push(hostUrls[i]);
                }
            }
        } else if (isBrowser) {
            let newhost = window.location.host;
            url = [`${protocol}://${newhost}`];
            url += `/${
                data.organization_id ||
                (await this.organization_id()) ||
                ""
            }`;
            urls.push(url);
        } else {
            console.log("missing host");
        }

        return urls;
    },

    async getSockets(data) {
        let sockets = [];
        let urls = await this.getUrls(data);
        for (let url of urls) {
            let socket = this.get(url);
            if (!socket) {
                await this.create(data);
                socket = this.get(url);
                if (socket) sockets.push(socket);
            } else {
                sockets.push(socket);
            }
        }
        return sockets;
    },

    sendLocalMessage(data) {
        this.__fireListeners(data);
    }
};

CoCreateSocketClient.init();

if (isBrowser) {
    window.onstorage = (e) => {
        if (e.key == "localSocketMessage" && indexeddb && e.newValue) {
            let data = JSON.parse(e.newValue);
            CoCreateSocketClient.sendLocalMessage(data);
        }
    };
}

export default CoCreateSocketClient;
