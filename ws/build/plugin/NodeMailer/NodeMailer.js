"use strict";
const nodemailer = require("nodemailer");

module.exports.send = async (options = {
        subject: '',
        recipients: 'nincas21@gmail.com, ken.invech3e@gmail.com', // separated by comma ,
        htmlMessage: '<i>Message was not set.</i>'
    }, user = 'nino.invech3e@gmail.com', pass = '0ayy2pak') => {    
    let configuration = {
        pool: true,
        host: 'smtp.gmail.com',
        port: 465,
        secure: true, // use SSL
        auth: {
            user: user, // generated ethereal user
            pass: pass, // generated ethereal password
        },
        tls: {
            // do not fail on invalid certs
            rejectUnauthorized: false
        }
    };

    let transporter = nodemailer.createTransport(configuration);

    // send mail with defined transport object
    let info = await transporter.sendMail({
        from: '"Inplay Server 🌟" <nino.invech3e@gmail.com>', // sender address
        to: options.recipients , // list of receivers
        subject: "Inplay Server - Notification: " + options.subject, // Subject line
        html: options.htmlMessage, // html body
    });

    return true;
}