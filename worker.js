var fs = require('fs');
var express = require('express');
var serveStatic = require('serve-static');
var path = require('path');
var dummyData = require('./sc_modules/dummy-data');
var accessControl = require('./sc_modules/access-control');
var authentication = require('./sc_modules/authentication');
var scCrudRethink = require('sc-crud-rethink');
var nodemailer = require('nodemailer');
var smtpTransport = require('nodemailer-smtp-transport');
var CronJob = require('cron').CronJob;
var json2html = require('node-json2html');
var moment = require('moment');


var sendEmail = function(email, subject, body) {

    process.env.NODE_TLS_REJECT_UNAUTHORIZED = 0;
    console.log(body);
    //test email
    //email="rocky@mail.sg"
    //subject="Test ! "+subject
    var transporter = nodemailer.createTransport(smtpTransport({
        name: 'outlook',
        host: 'mailhost.host.com',
        port: 587,
        auth: {
            user: 'host',
            pass: 'pass'
        }

    }));

    transporter.sendMail({
        from: "Report <report@mail.sg>",
        to: email,
        bcc:'rocky@mail.sg',
        subject: subject,
        html: body,
        debug: true
    }, function(error, info) {
        if (error) {
            return console.log(error);
        }
        console.log('Message sent: ' + info.response);
    });
}

var formatDate = function(d) {
    var date = new Date(d);
    var monthNames = [
        "January", "February", "March",
        "April", "May", "June", "July",
        "August", "September", "October",
        "November", "December"
    ];
    var day = date.getDate();
    var monthIndex = date.getMonth();
    var year = date.getFullYear();
    console.log(day, monthNames[monthIndex], year);
    return day + ' ' + monthNames[monthIndex] + ' ' + year;
}





module.exports.run = function(worker) {

    console.log('   >> Worker PID:', process.pid);

    var httpServer = worker.httpServer;
    var scServer = worker.scServer;

    // Use ExpressJS to handle serving static HTTP files
    var app = require('express')();
    app.use(serveStatic(path.resolve(__dirname, 'public')));
    httpServer.on('request', app);

    /*
      Here we attach some modules to scServer - Each module injects their own logic into the scServer to handle
      a specific aspect of the system/business logic.
    */

    var thinky = scCrudRethink.thinky;
    var type = thinky.type;

    var crudOptions = {
        defaultPageSize: 5,
        schema: {
            Category: {
                fields: {
                    id: type.string(),
                    name: type.string(),
                    desc: type.string().optional()
                },
                views: {
                    alphabeticalView: {
                        order: function(r) {
                            return r.asc('name');
                        }
                    }
                }
            },
            Product: {
                fields: {
                    id: type.string(),
                    name: type.string(),
                    qty: type.number().integer().optional(),
                    price: type.number().optional(),
                    desc: type.string().optional(),
                    category: type.string()
                },
                views: {
                    categoryView: {
                        filter: function(r, categoryId) {
                            return r.row('category').eq(categoryId);
                        },
                        order: function(r) {
                            return r.asc('qty');
                        }
                    }
                }
            },
            User: {
                fields: {
                    id: type.string(),
                    username: type.string(),
                    password: type.string(),
                    store: type.string(),
                    stores: type.array(),
                    email: type.string(),
                    daily: type.boolean(),
                    weekly: type.boolean(),
                    monthly: type.boolean()
                }
            },
            StoreInfo: {
                fields: {
                    StoreName: type.string(),
                    BillCost: type.number(),
                    BillCount: type.number(),
                    TableCount: type.number(),
                    TableOpenedCount: type.number()
                }
            }

        },

        thinkyOptions: {
            host: '192.168.88.145',
            port: 28015,
            db: "database"

        }
    };

    var crud = scCrudRethink.attach(worker, crudOptions);
    scServer.thinky = crud.thinky;

    // Add some dummy data to our store
    dummyData.attach(scServer, crud);

    // Access control middleware
    accessControl.attach(scServer);

    
      app.route('/api/fail').get(function(req, res) {
          
          console.log("fail store id "+req.query.store);
          console.log("fail msg "+req.query.msg);                    
          sendEmail("rocky@mail.sg","fail "+req.query.store,req.query.msg);
          
      });
     app.route('/api/mail/daily').get(function(req, res) {
         console.log(req.query);
        if(req.query.store !=null)
        {
            console.log("send daily email to store: "+req.query.store);
          dailyfuncByStore(req.query.store);   
        }else
         {
              console.log("send all store");
            dailyfunc();
         }
        console.log(new Date());
 
        res.send("sent finish.");
    });
    app.route('/api/mail/test').get(function(req, res) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = 0;
        var transporter = nodemailer.createTransport(smtpTransport({
            name: 'outlook',
            host: 'host.com',
            port: 587,
            auth: {
                user: 'host',
                pass: 'pass'
            }

        }));
        console.log(transporter);
        transporter.sendMail({
            to: 'support@mail.sg',
            cc: 'report@mail.sg',
            subject: 'hello test',
            text: 'hello world!',
            debug: true
        }, function(error, info) {
            if (error) {
                return console.log(error);
            }
            console.log('Message sent: ' + info.response);
            res.send(info.response);
        });
        res.send("sent finish.");
    });
    
    //laosichuan rouding 510102 ,yiqipin rouding 510199
    var getChargesQuery = function(store, fromDate, toDate) {
    
        var r = scServer.thinky.r;
        var rfd = r.time(
            parseInt(fromDate[0]), parseInt(fromDate[1]), parseInt(fromDate[2]), 'Z');
        var rtd = r.time(
            parseInt(toDate[0]), parseInt(toDate[1]), parseInt(toDate[2]), 'Z');

        var items = r.db("database_" + store).table("BillChargeItemHis").between(rfd, rtd, {
            index: 'BillDate'
        });

        var moneys = items.filter(function(item) {
            return item('DebtorAmount').eq(0).not()

        })
            .filter(function(item) {
                var code = item("SubjectCode").coerceTo('number');
                return code.gt(1001001).or(code.eq(1001001)).and(code.lt(1002999).or(code.eq(1002999))).or(code.gt(5102001).or(code.eq(5102001)).and(code.lt(5102999).or(code.eq(5102999)))); 
            }).group("SubjectCode", "SubjectName")
            .sum("DebtorAmount").ungroup().orderBy(r.desc("reduction")).map(function(doc) {
                return {
                    Code: doc("group")(0),
                    Name: doc("group")(1),
                    Total: doc("reduction")
                };
            });
          //.or(code.eq(510101)).or(code.eq(510102)).or(code.eq(510199)).or(code.eq(5101001)).or(code.eq(5101002))

        var gstandsc = items.filter(function(item) {
            return item('LenderAmount').eq(0).not()

        })
            .filter(function(item) {
                return item("SubjectCode").eq('510100').or(item("SubjectCode").eq('2171003'));
            })
            .group("SubjectCode", "SubjectName")
            .sum("LenderAmountReal").ungroup().orderBy(r.desc("reduction")).map(function(doc) {
                return {
                    Code: doc("group")(0),
                    Name: doc("group")(1),
                    Total: doc("reduction")
                };
            });
        var s = moneys.sum('Total');
        var gst = gstandsc.filter({
            Code: '2171003'
        });
        var t = gst.sum('Total');
        var bfgst = s.sub(t);

        //Void
        var backitems = items.filter(function(item) {
            return item('OrderQty').eq(item('ChargeQty')).not()
        }).map(function(item) {
            return {
                BillNo: item('BillNo'),
                Price: item('MenuItemPrice').mul(item('OrderQty').sub(item('ChargeQty')))
            };
        });
        //var backbillcount=backitems.getField('BillNo').distinct().count();
        var backsum = backitems.sum('Price');

        //Gift
        //var giftcount= r.db("database_faigo").table("BillMenuItemHis").filter(function(item) { return item('Gifter').eq('').not(); }).getField('BillNo').distinct().count();

        var giftsum = r.db("database_" + store).table("BillMenuItemHis").between(rfd, rtd, {
            index: 'BillDate'
        }).filter(function(item) {
            return item('Gifter').eq('').not();
        }).sum('OriginOrderPrice');

        //Covers
        var covercount = r.db("database_" + store).table("BillHis").between(rfd, rtd, {
            index: 'BillDate'
        }).sum('GuestQty');


        return moneys.union([{
            Code: '1',
            Name: 'Net Amount',
            Total: s
        }, {
                Code: '2',
                Name: 'Net Amount BF GST',
                Total: bfgst
            }, {
                Code: '3',
                Name: 'Void',
                Total: backsum
            }, {
                Code: '4',
                Name: 'Gift or Complimentary',
                Total: giftsum
            }, {
                Code: '5',
                Name: 'Average Per Pax',
                Total: 0
            }, {
                Code: '6',
                Name: 'Cover (Pax)',
                Total: covercount
            }])
            .union(gstandsc);

    }
    var dataToFixed = function(data) {
        data.forEach(function(item) {
            
            
            if(item.Code=='6')
            {  
                  item.Total = parseInt(item.Total); 
               return;
            }
            item.Total = Math.round(item.Total * 1e2) / 1e2
        });
    };
    var calculateAvg = function(data) {

        var avg = data.filter(function(item) {
            return item.Code == '5'
        });
        var ntmount = data.filter(function(item) {
            return item.Code == '2'
        });
        var covercount = data.filter(function(item) {
            return item.Code == '6'
        });
        if (covercount[0].Total > 0) {

            avg[0].Total = (ntmount[0].Total / covercount[0].Total);
        }

    }
    var washData = function(data) {
        calculateAvg(data);
        dataToFixed(data);

    }
    var sendMailTask = function(usersdata, mailtitle, from, to) {
        var r = worker.scServer.thinky.r;


        usersdata.run().then(function(users) {
            //read data
            if (users == null || users.length == 0) {
                return;
            }
            users.forEach(function(user, index, array) {

                var charges = getChargesQuery(user.store, from, to);

                var title = user.store + ' - ' + mailtitle;
                charges.run().then(function(data) {
                    washData(data);

                    data.forEach(function(item) {
                        if(item.Code=='6')
                        {  
                            item.Total = parseInt(item.Total); 
                            return;
                        }
                        item.Total = item.Total.toFixed(2).replace(/(\d)(?=(\d{3})+\.)/g, '$1,');
                    });
                    console.log(data);

                    var bankandcash = data.filter(function(item) {
                        var code = parseInt(item.Code)
                        return code >= 1001001 && code <= 1002999;
                    });

                    console.log(bankandcash);
                    var netamount = data.filter(function(item) {
                        var code = parseInt(item.Code);
                        return code == 1 || code == 2;
                    });
                    var gstamount = data.filter(function(item) {
                        var code = parseInt(item.Code);
                        return code == 2171003;
                    });
                    var serviceChargeAmount = data.filter(function(item) {
                        var code = parseInt(item.Code);
                        return code == 510100;
                    });
                    var discountAmount = data.filter(function(item) {
                        var code = parseInt(item.Code);
                        return code == 510101 || code == 510102 || code ==  510199;
                    });
                    var voidAmount = data.filter(function(item) {
                        var code = parseInt(item.Code);
                        return code == 3 || code == 4;
                    });
                    var paxAmount = data.filter(function(item) {
                        var code = parseInt(item.Code);
                        return code == 5 || code == 6;
                    });

                    var transform = {
                        'tag': 'tr',
                        'html': '<td> ${Name}</td><td align="right"> ${Total}</td>'
                    };
                    var htmlline = '<tr style="line-height:1px;height:1px; "><td colspan="2" style="font-size: 1px;line-height:1px;background:none; border-top: 1px solid #151616; height:1px; width:100%; margin:0px 0px 0px 0px;">&nbsp;</td></tr>';

                    var html = '<h4>' + title + '</h4><br/><table><tr><td><b>Name</b></td><td align="right"><b>Total</b></td></tr>'
                        + htmlline

                        + json2html.transform(bankandcash, transform)
                        + htmlline
                        + json2html.transform(netamount, transform)
                        + json2html.transform(gstamount, transform)
                        + htmlline
                        + json2html.transform(serviceChargeAmount, transform)
                        + json2html.transform(discountAmount, transform)
                        + json2html.transform(voidAmount, transform)
                        + htmlline
                        + json2html.transform(paxAmount, transform)
                        + '</table>';
                    html = html + '<br/>' +'<a href ="http://server.com:8066" target="_blank">Go To Dashboard</a><br/>';
                    console.log(html);
 
                  sendEmail(user.email, title,
                      html //JSON.stringify(data)
                  );


                }).error(function(error) {
                    console.log(error.message);
                });
            });



        }).error(function(error) {
            console.log(error.message);
        });

    };


    app.route('/api/topsales').get(function(req, res) {

        console.log('query ', req.query);
        var topn = parseInt(req.query.top);
        var fromDate = req.query.fromDate.split('-');
        var toDate = req.query.toDate.split('-');
        //  var fromDate = req.query.fromDate.split('-');

        var store = req.headers.store;
        var r = scServer.thinky.r;
        var rfd = r.time(
            parseInt(fromDate[0]), parseInt(fromDate[1]), parseInt(fromDate[2]), 'Z');
        var rtd = r.time(
            parseInt(toDate[0]), parseInt(toDate[1]), parseInt(toDate[2]), 'Z');
        var data = r.db("database_" + store).table("BillMenuItemHis")
            .between(rfd, rtd, {
                index: 'BillDate'
            })
            .filter(function(item) {
                return item("ChargeQty").eq(0).not().and(item("MenuItemCode").eq("95001").not()).and(item("MenuItemCode").eq("00001").not()).and(item("MenuItemCode").eq("0000").not()).and(item("MenuItemCode").eq("97000").not());
            })
            .group("MenuItemCode", "MenuItemName")
            .sum("MenuItemPrice").ungroup().orderBy(r.desc("reduction"))
            .limit(topn)
            .map(function(doc) {
                return {
                    "Code": doc("group")(0),
                    "Name": doc("group")(1),
                    Total: doc("reduction")
                };
            })
            .run().then(function(topsales) {
                dataToFixed(topsales);
                console.log(topsales);
                res.json(topsales);
            }).error(handleError(res));

    });


    app.route('/api/subjects').get(function(req, res) {

        console.log('Summary ');
        console.log('params ', req.query);
        console.log('store ', req.headers.store);

        var fromDate = req.query.fromDate.split('-');
        var toDate = req.query.toDate.split('-');
        var store = req.headers.store;
        // var store='test';
        // var fromDate = '2015-01-01'.split('-');
        // var toDate = '2015-11-01'.split('-');
        var r = scServer.thinky.r;
        var rfd = r.time(
            parseInt(fromDate[0]), parseInt(fromDate[1]), parseInt(fromDate[2]), 'Z');
        var rtd = r.time(
            parseInt(toDate[0]), parseInt(toDate[1]), parseInt(toDate[2]), 'Z');

        var charges = getChargesQuery(store, fromDate, toDate);
        charges.run().then(function(data) {
            washData(data);
            console.log(data);
            res.json(data);
        }).error(handleError(res));

    });
    /*
      In here we handle our incoming realtime connections and listen for events.
    */
    scServer.on('connection', function(socket) {
        /*
          Attach some modules to the socket object - Each one decorates the socket object with
          additional features or business logic.
        */

        // Authentication logic
        authentication.attach(scServer, socket);


    });




    //daily task
    var dailyfunc = function() {
        var yesterday = moment().subtract(1, 'days');
        console.log(yesterday.format('LL'));
        var from = yesterday.toArray();
        from[1] = from[1] + 1;
        var to = moment().toArray();
        to[1] = to[1] + 1;
        //test
        //var from = '2016-03-09'.split('-');
        //var to = '2016-03-09'.split('-');
        console.log(from);
        console.log(to);
        var r = worker.scServer.thinky.r;

        var usersdata = r.db("database").table("User").filter({ daily: true });
        console.log(usersdata);
        sendMailTask(usersdata, 'Daily Report ' + yesterday.format('LL'), from, to);
    };
    
     var dailyfuncByStore = function(storeId) {
        var yesterday = moment().subtract(1, 'days');
        console.log(yesterday.format('LL'));
        var from = yesterday.toArray();
        from[1] = from[1] + 1;
        var to = moment().toArray();
        to[1] = to[1] + 1;
        //test
        //var from = '2016-03-09'.split('-');
        //var to = '2016-03-09'.split('-');
        console.log(from);
        console.log(to);
        var r = worker.scServer.thinky.r;

        var usersdata = r.db("database").table("User").filter({ store: storeId });
        console.log(usersdata);
      sendMailTask(usersdata, 'Daily Report ' + yesterday.format('LL'), from, to);
    };   

    var weeklyfunc = function() {
        var todate = moment();
        var fromdate = moment().subtract(7, 'days');
        console.log(fromdate.format('LL'));
        var from = fromdate.toArray();
        from[1] = from[1] + 1;
        var to = moment().toArray();
        to[1] = to[1] + 1;
        console.log(from);
        console.log(to);
        var r = worker.scServer.thinky.r;

        var usersdata = r.db("database").table("User").filter({ weekly: true });
        sendMailTask(usersdata, 'Weekly Report ' + todate.format('ww') + 'th', from, to);
    };
    var monthlyfunc = function() {
        var todate = moment();
        var yesterday = moment().subtract(1, 'days');
        var fromdate = moment(new Date(yesterday.year(), yesterday.month(), 1));
        console.log(fromdate.format('LL'));
        var from = fromdate.toArray();
        from[1] = from[1] + 1;
        var to = todate.toArray();
        to[1] = to[1] + 1;
        console.log(from);
        console.log(to);
        var r = worker.scServer.thinky.r;

        var usersdata = r.db("database").table("User").filter({ monthly: true });
        sendMailTask(usersdata, 'Monthly Report ' + todate.format('MM'), from, to);
    };
    //test run Code
    //dailyfunc();
    //weeklyfunc();
    //monthlyfunc();
    //Cron Task
    // var dailytask = new CronJob('00 00 18 * * *', function() {

    //   console.log('daily task');
    //   dailyfunc();

    //}, null, true);
    //weekly task
    new CronJob('00 30 18 * * 1', function() {

        console.log('weekly task');
        weeklyfunc();


    }, null, true);

    //monthly task
    new CronJob('00 30 18 1 * *', function() {

        console.log('monthly task');
        monthlyfunc();

    }, null, true);

};

function handleError(res) {
    return function(error) {
        console.log(error.message);
        if (res) {
            return res.send(500, {
                error: error.message
            });
        }
        return;
    }
}
