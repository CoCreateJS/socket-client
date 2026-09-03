# CoCreate-socket-client

A simple socket component in vanilla javascript. Easily configured using HTML5 attributes and/or JavaScript API. Take it for a spin in our [playground!](https://cocreate.app/docs/socket-client)

![minified](https://img.badgesize.io/https://cdn.cocreate.app/socket-client/latest/CoCreate-socket-client.min.js?style=flat-square&label=minified&color=orange)
![gzip](https://img.badgesize.io/https://cdn.cocreate.app/socket-client/latest/CoCreate-socket-client.min.js?compression=gzip&style=flat-square&label=gzip&color=yellow)
![brotli](https://img.badgesize.io/https://cdn.cocreate.app/socket-client/latest/CoCreate-socket-client.min.js?compression=brotli&style=flat-square&label=brotli)
![GitHub latest release](https://img.shields.io/github/v/release/CoCreate-app/CoCreate-socket-client?style=flat-square)
![License](https://img.shields.io/github/license/CoCreate-app/CoCreate-socket-client?style=flat-square)
![Hiring](https://img.shields.io/static/v1?style=flat-square&label=&message=Hiring&color=blueviolet)

![CoCreate-socket-client](https://cdn.cocreate.app/docs/CoCreate-socket-client.gif)

## [Docs & Demo](https://cocreate.app/docs/socket-client)

For a complete guide and working demo refer to the [doumentation](https://cocreate.app/docs/socket-client)

## CDN

```html
<script src="https://cdn.cocreate.app/socket-client/latest/CoCreate-socket-client.min.js"></script>
```

```html
<script src="https://cdn.cocreate.app/socket-client/latest/CoCreate-socket-client.min.css"></script>
```

## NPM

```shell
$ npm i @cocreate/socket-client
```

## yarn

```shell
$ yarn install @cocreate/socket-client
```

# Table of Contents

-   [Table of Contents](#table-of-contents)
-   [Usage](#usage)
-   [Message routing](#message-routing)
-   [Browser-context delivery](#browser-context-delivery)
-   [Announcements](#announcements)
-   [Roadmap](#roadmap)
-   [How to Contribute](#how-to-contribute)
-   [About](#about)
-   [License](#license)

# Usage

Messages use one envelope. The `method` selects the event or operation and the remaining properties contain its payload.

```js
import socket from "@cocreate/socket-client";

const response = await socket.send({
    method: "notification",
    message: "The workspace was updated",
    broadcast: false,
    broadcastClient: true
});
```

The socket client automatically supplies connection metadata including `clientId`, `frameId`, `socketId`, `organization_id`, `uuid`, and `timeStamp`.

# Message routing

-   `clientId` identifies the browser and is shared by its tabs, windows, and same-origin frames.
-   `frameId` identifies one socket-client runtime, such as a tab, window, or iframe.
-   `socketId` identifies an individual WebSocket instance. It is generated for each socket and is not shared through session storage.
-   `broadcast` controls server delivery. `false` targets the originating or selected client; `true` targets eligible clients in the organization.
-   `broadcastClient` controls whether a received server message is relayed to the browser's other same-origin contexts.
-   `broadcastSender: false` prevents the originating frame from firing normal method listeners for the response. The response still returns and resolves its UUID promise.

The socket server sends to one connected socket for each selected `clientId`. If one socket cannot be reached, it can try another socket belonging to that client. Browser-context distribution is then handled by socket-client when `broadcastClient` is enabled.

# Browser-context delivery

Socket-client stores the complete relay payload in the `localSocketMessages` array of the shared `system` IndexedDB database. The `messageQueue` array uses the same internal database. Records retain `organization_id` for organization-scoped filtering, while application databases remain free of socket transport state. Socket-client writes only the record ID and organization ID to the `localSocketMessage` local-storage key, allowing other contexts to retrieve the message without being constrained by local-storage value limits.

The native `storage` event fires in the other same-origin contexts, not in the context that performed the write. The receiving contexts read the IndexedDB record and fire their local listeners. Each new relay also removes records older than five seconds.

<a name="announcements"></a>

# Announcements

All updates to this library are documented in our [CHANGELOG](https://github.com/CoCreate-app/CoCreate-socket-client/blob/master/CHANGELOG.md) and [releases](https://github.com/CoCreate-app/CoCreate-socket-client/releases). You may also subscribe to email for releases and breaking changes.

<a name="roadmap"></a>

# Roadmap

If you are interested in the future direction of this project, please take a look at our open [issues](https://github.com/CoCreate-app/CoCreate-socket-client/issues) and [pull requests](https://github.com/CoCreate-app/CoCreate-socket-client/pulls). We would love to hear your feedback.

<a name="about"></a>

# About

CoCreate-socket-client is guided and supported by the CoCreate Developer Experience Team.

Please Email the Developer Experience Team [here](mailto:develop@cocreate.app) in case of any queries.

CoCreate-socket-client is maintained and funded by CoCreate. The names and logos for CoCreate are trademarks of CoCreate, LLC.

<a name="contribute"></a>

# How to Contribute

We encourage contribution to our libraries (you might even score some nifty swag), please see our [CONTRIBUTING](https://github.com/CoCreate-app/CoCreate-socket-client/blob/master/CONTRIBUTING.md) guide for details.

We want this library to be community-driven, and CoCreate led. We need your help to realize this goal. To help make sure we are building the right things in the right order, we ask that you create [issues](https://github.com/CoCreate-app/CoCreate-socket-client/issues) and [pull requests](https://github.com/CoCreate-app/CoCreate-socket-client/pulls) or merely upvote or comment on existing issues or pull requests.

We appreciate your continued support, thank you!

<a name="license"></a>

# License

This software is dual-licensed under the GNU Affero General Public License version 3 (AGPLv3) and a commercial license.

-   **Open Source Use**: For open-source projects and non-commercial use, this software is available under the AGPLv3. The AGPLv3 allows you to freely use, modify, and distribute this software, provided that all modifications and derivative works are also licensed under the AGPLv3. For the full license text, see the [LICENSE file](https://github.com/CoCreate-app/CoCreate-socket-client/blob/master/LICENSE).

-   **Commercial Use**: For-profit companies and individuals intending to use this software for commercial purposes must obtain a commercial license. The commercial license is available when you sign up for an API key on our [website](https://cocreate.app). This license permits proprietary use and modification of the software without the copyleft requirements of the AGPLv3. It is ideal for integrating this software into proprietary commercial products and applications.

If you have not purchased a commercial license and intend to use this software for commercial purposes, you are required to sign up for an API key on our website.
