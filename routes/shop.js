var express = require('express');
var router = express.Router();

const session = require("express-session");
const flash = require("express-flash");
const passport = require("passport");
const pg = require("pg");
const bcrypt = require("bcrypt");
const {reject} = require("bcrypt/promises");


var app = express();

var config = {
    user: "",
    database: "",
    password: "",
    host:"",
    port: 5432,
    max: 100,
    idleTimeoutMillis: 30000
};

var pool = new pg.Pool(config);

//shop funkcije

const initializeShop = require('../passportShop');
initializeShop(passport);

app.use(session({
    secret: 'secret',
    resave: false,
    saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

app.use(flash());



module.exports = router;