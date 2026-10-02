# @blockyrts/protocol

The message formats shared by the client and the server: the lockstep input
frame (one per player per step, carrying that player's orders for step N + D
and, every 20 steps, the state hash), the lobby messages (rooms, join codes,
ready, pause and the host's choices) and the account and save API.

All of it is a hand-written binary codec over typed arrays, versioned, with no
JSON on the hot path (technical decisions 1 and 3). It is a stub until M9,
when the relay and multiplayer are built.
