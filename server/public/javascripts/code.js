import {Session, Editor} from './vacio.js';

var session = new Session("mytest");

var editor = window.editor = new Editor("#canvas");
editor.connect()
editor.setSession(session);




