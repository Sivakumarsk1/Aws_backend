require("dotenv").config();
const mysql = require('mysql2/promise');
const nodemailer = require("nodemailer"); 
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Database pool configuration
const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'doctor_appointment',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Book appointment
async function bookAppointment(appointmentData) {
    let connection;
    try {
        connection = await pool.getConnection();
        const [rows] = await connection.query(
            "INSERT INTO appointments (email, name, age, gender, date, time, address) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [appointmentData.email, appointmentData.name, appointmentData.age, 
             appointmentData.gender, appointmentData.date, 
             appointmentData.time, appointmentData.address]
        );
        return rows;
    } finally {
        if (connection) connection.release();
    }
}

// Email transporter
const transporter = nodemailer.createTransport({
    service: "gmail",
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
        user: "sivakumarb3928@gmail.com",
        pass: "sqwy eleh iunc cjsu"
    },
    tls: {
        rejectUnauthorized: false
    }
});

transporter.verify((error) => {
    if (error) {
        console.error("Mail transporter error:", error);
    } else {
        console.log("Mail transporter is ready to send emails");
    }
});

app.post("/save", async (req, res) => {
    const { doorNo, street, landmark, area, city } = req.body;
    
    if (!street || !area || !city) {
        return res.status(400).send("Address saved sucessfully");
    }

    const sql = "INSERT INTO addresses (doorNo, street, landmark, area, city) VALUES (?, ?, ?, ?, ?)";

    try {
        const [result] = await pool.query(sql, [doorNo, street, landmark, area, city]);
        res.status(200).send("Address saved successfully!");
    } catch (err) {
        console.error(err);
        res.status(500).send("Error saving address");
    }
});

app.get("/api/address/latest", async (req, res) => {
    const sql = "SELECT * FROM addresses WHERE id = (SELECT MAX(id) FROM addresses)";
    
    try {
        const [result] = await pool.query(sql);
        if (result.length > 0) {
            res.status(200).json(result[0]); 
        } else {
            res.status(404).json({ message: "No address found" });
        }
    } catch (err) {
        console.error(err);
        res.status(500).send("Error fetching latest address");
    }
});

app.post("/api/check-slot", async (req, res) => {
    const { date, time } = req.body;

    if (!date || !time) {
        return res.status(400).json({ available: false, message: "Date and time are required" });
    }

    try {
        const [rows] = await pool.query(
            "SELECT COUNT(*) as count FROM appointments WHERE date = ? AND time = ?",
            [date, time]
        );

        if (rows[0].count > 0) {
            return res.status(200).json({ available: false, message: "Slot already booked" });
        }

        return res.status(200).json({ available: true });
    } catch (error) {
        console.error("Error checking slot availability:", error);
        return res.status(500).json({ available: false, message: "Server error" });
    }
});

app.get("/api/booked-slots/:date", async (req, res) => {
    const { date } = req.params;

    try {
        const [rows] = await pool.query(
            "SELECT time FROM appointments WHERE date = ?",
            [date]
        );
        const bookedSlots = rows.map(row => row.time);
        res.status(200).json({ bookedSlots });
    } catch (error) {
        console.error("Error fetching booked slots:", error);
        res.status(500).json({ message: "Server error" });
    }
});


app.post("/api/appointment/confirm", async (req, res) => {
    const { email, name, age, gender, date, time, address } = req.body;
    
    if (!email || !name || !date || !time || !address) {
        return res.status(400).json({
            success: false,
            message: "Required fields are missing"
        });
    }

    try {
        const mailOptions = createMailOptions(email, name, age, gender, date, time, address);
        console.log(`Sending appointment confirmation to: ${email}`);
        const info = await transporter.sendMail(mailOptions);
        console.log(`Email sent to ${email}:`, info.response);
        
        const appointmentData = {
            email,
            name,
            age: age || null,
            gender: gender || null,
            date,
            time,
            address
        };
        
        await bookAppointment(appointmentData);
        
        res.status(200).json({
            success: true,
            message: "Appointment confirmed and confirmation email sent successfully!"
        });
    } catch (error) {
        console.error("Appointment Error for", email, ":", error); 
        res.status(500).json({
            success: false,
            message: "Error confirming appointment. Please try again later.",
            error: error.message
        });
    }
});

// 🆕 Helper function to format date nicely
function formatReadableDate(dateStr) {
    const dateObj = new Date(dateStr);
    const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
    return dateObj.toLocaleDateString('en-US', options); 
}

// Email content creator
function createMailOptions(email, name, age, gender, date, time, address) {
    const formattedAddress = address.split('\n').map(line => line.trim()).join('<br>');
    const formattedDate = formatReadableDate(date);

    return {
        from: '"Doctor Appointment System" <sivakumarb3928@gmail.com>',
        to: email,
        subject: `Appointment Confirmation for ${name}`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #2c3e50;">Appointment Confirmation</h2>
                <p style="font-size: 16px;">Dear ${name},</p>
                <p style="font-size: 16px;">Thank you for booking your appointment with us. Here are your details:</p>
                
                <div style="background: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0;">
                    <h3 style="color: #2c3e50; margin-top: 0;">Patient Information</h3>
                    <p style="margin: 5px 0;"><strong>Name:</strong> ${name}</p>
                    ${age ? `<p style="margin: 5px 0;"><strong>Age:</strong> ${age}</p>` : ''}
                    ${gender ? `<p style="margin: 5px 0;"><strong>Gender:</strong> ${gender}</p>` : ''}
                    
                    <h3 style="color: #2c3e50;">Appointment Details</h3>
                    <p style="margin: 5px 0;"><strong>Date:</strong> ${formattedDate}</p>
                    <p style="margin: 5px 0;"><strong>Time:</strong> ${time}</p>
                    
                    <h3 style="color: #2c3e50;">Address</h3>
                    <p style="margin: 5px 0;">${formattedAddress}</p>
                </div>
                
                <div style="margin-top: 20px;">
                    <h3 style="color: #2c3e50;">Important Notes</h3>
                    <ul style="padding-left: 20px;">
                        <li>Please arrive 10 minutes before your scheduled time</li>
                        <li>Bring your ID and any relevant medical documents</li>
                        <li>Fasting may be required for certain tests</li>
                    </ul>
                </div>
                
                <p style="font-size: 16px; margin-top: 20px;">If you need to reschedule or cancel, please contact us at least 24 hours in advance.</p>
                
                <p style="font-size: 16px;">Best regards,</p>
                <p style="font-size: 16px; font-weight: bold;">Doctor Appointment Team</p>
            </div>
        `
    };
}

app.listen(5001, () => console.log("Server running on port 5001"));
