const LocalStrategy = require("passport-local").Strategy;
const bcrypt = require('bcrypt');
const pg = require("pg");

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


function initialize(passport) {
    const authenticateUser = (email, password, done) => {
        pool.query(`select * from kupac where email = $1 and uloga='admin';`, [email], (err, result) => {
            if(err) {
                throw err;
            }
            //ako je veci od 1, nasao je korisnika
            if(result.rows.length > 0) {
                const user = result.rows[0];

                bcrypt.compare(password, user.password, (err, isMatch) => {
                    if(err) {
                        throw err;
                    }
                    //prvi error, drugi korisnik
                    if(isMatch) {
                        return done(null, user);
                    }else {
                        return done(null, false, {poruka: "Password nije tacan"});
                    }
                })
            } else {
                return done(null, false, {poruka: "Email nije registrovan."});
            }
        })
    }


    passport.use('passportAdmin', new LocalStrategy({
        usernameField: 'email',
        passwordField: 'password'
    }, authenticateUser));


    passport.serializeUser((user, done) => done(null,user.id_kupac));

    passport.deserializeUser((id, done) => {
        pool.query(`select * from kupac where id_kupac = $1`, [id], (err, result) => {
            if(err) {
                throw err;
            }
            return done(null, result.rows[0]);
        })
    });


}



module.exports = initialize;