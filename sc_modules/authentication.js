module.exports.attach = function (scServer, socket) {
  var tokenExpiresInMinutes = 10;

  var tokenRenewalIntervalInMilliseconds = Math.round(1000 * 60 * tokenExpiresInMinutes / 3);

  // Keep renewing the token (if there is one) at a predefined interval to make sure that
  // it doesn't expire while the connection is active.
  var renewAuthTokenInterval = setInterval(function () {
    var currentToken = socket.getAuthToken();
    if (currentToken) {
      socket.setAuthToken(currentToken, {expiresInMinutes: tokenExpiresInMinutes});
    }
  }, tokenRenewalIntervalInMilliseconds);

  socket.once('disconnect', function () {
    clearInterval(renewAuthTokenInterval);
  });

  var validateLoginDetails = function (loginDetails, respond) {
    scServer.thinky.r.db("yumstone").table('User').filter({username: loginDetails.username}).run(function (err, results) {
      console.log('login '+results);
      if (results && results[0] && results[0].password == loginDetails.password) {
        var token = {
          username: loginDetails.username
        };
        socket.setAuthToken(token, {expiresInMinutes: tokenExpiresInMinutes});
       var str={}; results
       if (results[0].id) {
         console.log('login '+results[0].id);
          respond(null,results[0].id);
       }else {
           respond();
       }

      } else {
        // This is not really an error.
        // We are simply rejecting the login - So we will
        // leave the first (error) argument as null.
        respond(null, 'Invalid username or password');
      }
    });
  };

  socket.on('login', validateLoginDetails);
};
