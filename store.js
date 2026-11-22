'use strict';
const fs = require('fs');
const path = require('path');

const MAX_MESSAGES = 100;

/**
 * Tiny persistent store. Pass a file path to persist to disk
 * (mount it as a Docker volume), or null for in-memory (tests).
 */
function createStore(file) {
  let state = { counter: 0, nextId: 1, messages: [] };

  if (file) {
    try {
      state = { ...state, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
    } catch (_err) {
      // first run or unreadable file: start fresh
    }
  }

  function persist() {
    if (!file) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state));
    fs.renameSync(tmp, file); // atomic replace
  }

  return {
    getCounter: () => state.counter,
    incrementCounter() {
      state.counter += 1;
      persist();
      return state.counter;
    },
    resetCounter() {
      state.counter = 0;
      persist();
      return state.counter;
    },
    listMessages: () => [...state.messages].reverse(),
    addMessage(author, text) {
      const msg = {
        id: state.nextId++,
        author,
        text,
        createdAt: new Date().toISOString(),
      };
      state.messages.push(msg);
      if (state.messages.length > MAX_MESSAGES) state.messages.shift();
      persist();
      return msg;
    },
    deleteMessage(id) {
      const before = state.messages.length;
      state.messages = state.messages.filter((m) => m.id !== id);
      persist();
      return state.messages.length < before;
    },
  };
}

module.exports = { createStore };
