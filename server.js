import express from 'express';
import mongoose from 'mongoose';
import 'dotenv/config'
import bcrypt from 'bcrypt';
import { nanoid } from 'nanoid';
import jwt from 'jsonwebtoken';
import cors from 'cors';
import admin from "firebase-admin";
import serviceAccountKey from "./projeksainsdata-2b30f-firebase-adminsdk-do07o-bf71fd0a5b.json" assert { type: "json" };
import { getAuth } from "firebase-admin/auth";
import aws from "aws-sdk";
import { google } from 'googleapis';




// schema below
import User from './Schema/User.js';
import Blog from './Schema/Blog.js';
import Notification from "./Schema/Notification.js";
import Comment from "./Schema/Comment.js";
import ToDo from './Schema/ToDo.js';
import Notepad from './Schema/Notepad.js';
import SavedBlog from './Schema/SavedBlog.js';

const server = express();
let PORT = 3000;

admin.initializeApp({
    credential: admin.credential.cert(serviceAccountKey)
})

let emailRegex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/; // regex for email
let passwordRegex = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{6,20}$/; // regex for password

server.use(express.json());
server.use(cors())

mongoose.connect(process.env.DB_LOCATION, {
    autoIndex: true
})

// setting up s3 bucket
const s3 = new aws.S3({
    region: process.env.AWS_BUCKET_REGION,
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
})

const generateUploadURL = async () => {

    const date = new Date();
    const imageName = `${nanoid()}-${date.getTime()}.jpeg`;

    return await s3.getSignedUrlPromise('putObject', {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: imageName,
        Expires: 1000,
        ContentType: "image/jpeg"
    })

}

const uploadPdfToS3 = async (pdfBuffer) => {
    const pdfName = `${nanoid()}-${Date.now()}.pdf`;

    const params = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: pdfName,
        Body: pdfBuffer,
        ContentType: 'application/pdf'
    };

    await s3.upload(params).promise();

    return `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_BUCKET_REGION}.amazonaws.com/${pdfName}`;
};


const verifyJWT = (req, res, next) => {

    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(" ")[1];

    if(token == null){
        return res.status(401).json({ error: "No access token" })
    }

    jwt.verify(token, process.env.SECRET_ACCESS_KEY, (err, user) => {
        if(err) {
            return res.status(403).json({ error: "Access token is invalid" })
        }

        req.user = user.id
        next()
    })

}

const formatDatatoSend = (user) => {

    const access_token = jwt.sign({ id: user._id }, process.env.SECRET_ACCESS_KEY)

    return {
        access_token,
        profile_img: user.personal_info.profile_img,
        username: user.personal_info.username,
        fullname: user.personal_info.fullname
    }
}

const generateUsername = async (email) => {
    let username = email.split("@")[0];

    let isUsernameNotUnique = await User.exists({ "personal_info.username": username }).then((result) => result)

    isUsernameNotUnique ? username += nanoid().substring(0, 5) : "";

    return username;

}


const revokeGoogleTokens = async (accessToken) => {
    try {
        const OAuth2Client = new google.auth.OAuth2();
        await OAuth2Client.revokeToken(accessToken);
        console.log('Google tokens revoked successfully');
    } catch (error) {
        console.error('Failed to revoke Google tokens:', error.message);
        throw error;
    }
};

// upload image url route
server.get('/get-upload-url', (req, res) => {
    generateUploadURL().then(url => res.status(200).json({ uploadURL: url }))
    .catch(err => {
        console.log(err.message);
        return res.status(500).json({ error: err.message })
    })
})

server.post("/signup", (req, res) => {

    let { fullname, email, password } = req.body;

   // validating the data from frontend
   if(fullname.length < 3){
        return res.status(403).json({ "error": "Fullname must be at least 3 letters long" })
   }
   if(!email.length){
        return res.status(403).json({ "error": "Enter Email" })
   }
   if(!emailRegex.test(email)){
        return res.status(403).json({ "error": "Email is invalid" })
   }
   if(!passwordRegex.test(password)){
        return res.status(403).json({ "error": "Password should be 6 to 20 characters long with a numeric, 1 lowercase and 1 uppercase letters" })
   }

   bcrypt.hash(password, 10, async (err, hashed_password) => {

        let username = await generateUsername(email);

        let user = new User({
            personal_info: { fullname, email, password: hashed_password, username }
        })

        user.save().then((u) => {

            return res.status(200).json(formatDatatoSend(u))

        })
        .catch(err => {

            if(err.code == 11000) {
                return res.status(500).json({ "error": "Email already exists" })
            }

            return res.status(500).json({ "error": err.message })
        })

   }) 

})

server.post("/signin", (req, res) => {

    let { email, password } = req.body;

    User.findOne({ "personal_info.email": email })
    .then((user) => {
        if(!user){
            return res.status(403).json({ "error": "Email not found" });
        }
        

        if(!user.google_auth){

            bcrypt.compare(password, user.personal_info.password, (err, result) => {

                if(err) {
                    return res.status(403).json({ "error": "Error occured while login please try again" });
                }
    
                if(!result){
                    return res.status(403).json({ "error": "Incorrect password" })
                } else{
                    return res.status(200).json(formatDatatoSend(user))
                }
    
            })

        } else {
            return res.status(403).json({ "error": "Account was created using google. Try logging in with google." })
        }

    })
    .catch(err => {
        console.log(err.message);
        return res.status(500).json({ "error": err.message })
    })

})

server.post("/google-auth", async (req, res) => {

    let { access_token } = req.body;

    getAuth()
    .verifyIdToken(access_token)
    .then(async (decodedUser) => {

        let { email, name, picture } = decodedUser;

        picture = picture.replace("s96-c", "s384-c");

        let user = await User.findOne({"personal_info.email": email}).select("personal_info.fullname personal_info.username personal_info.profile_img google_auth").then((u) => {
            return u || null
        })
        .catch(err => {
            return res.status(500).json({ "error": err.message })
        })

        if(user) { // login
            if(!user.google_auth){
                return res.status(403).json({ "error": "This email was signed up without google. Please log in with password to access the account" })
            }
        }
        else { // sign up
            
            let username = await generateUsername(email);

            user = new User({
                personal_info: { fullname: name, email, username },
                google_auth: true
            })

            await user.save().then((u) => {
                user = u;
            })
            .catch(err => {
                return res.status(500).json({ "error": err.message })
            })

        }

        return res.status(200).json(formatDatatoSend(user))

    })
    .catch(err => {
        return res.status(500).json({ "error": "Failed to authenticate you with google. Try with some other google account" })
    })

})

server.post("/change-password", verifyJWT, (req, res) => {

    let { currentPassword, newPassword } = req.body; 

    if(!passwordRegex.test(currentPassword) || !passwordRegex.test(newPassword)){
        return res.status(403).json({ error: "Password should be 6 to 20 characters long with a numeric, 1 lowercase and 1 uppercase letters" })
    }

    User.findOne({ _id: req.user })
    .then((user) => {

        if(user.google_auth){
            return res.status(403).json({ error: "You can't change account's password because you logged in through google" })
        }

        bcrypt.compare(currentPassword, user.personal_info.password, (err, result) => {
            if(err) {
                return res.status(500).json({ error: "Some error occured while changing the password, please try again later" })
            }

            if(!result){
                return res.status(403).json({ error: "Incorrect current password" })
            }

            bcrypt.hash(newPassword, 10, (err, hashed_password) => {

                User.findOneAndUpdate({ _id: req.user }, { "personal_info.password": hashed_password })
                .then((u) => {
                    return res.status(200).json({ status: 'password changed' })
                })
                .catch(err => {
                    return res.status(500).json({ error: 'Some error occured while saving new password, please try again later' })
                })

            })
        })

    })
    .catch(err => {
        console.log(err);
        res.status(500).json({ error : "User not found" })
    })

})

server.post('/latest-blogs', (req, res) => {

    let { page } = req.body;

    let maxLimit = 5;

    Blog.find({ draft: false })
    .populate("author", "personal_info.profile_img personal_info.username personal_info.fullname -_id")
    .sort({ "publishedAt": -1 })
    .select("blog_id title des banner activity tags publishedAt -_id")
    .skip((page - 1) * maxLimit)
    .limit(maxLimit)
    .then(blogs => {
        return res.status(200).json({ blogs })
    })
    .catch(err => {
        return res.status(500).json({ error: err.message })
    })

})

server.post("/all-latest-blogs-count", (req, res) => {

    Blog.countDocuments({ draft: false })
    .then(count => {
        return res.status(200).json({ totalDocs: count })
    })
    .catch(err => {
        console.log(err.message);
        return res.status(500).json({ error: err.message })
    })

})

server.get("/trending-blogs", (req, res) => {

    Blog.find({ draft: false })
    .populate("author", "personal_info.profile_img personal_info.username personal_info.fullname -_id")
    .sort({ "activity.total_read": -1, "activity.total_likes": -1, "publishedAt": -1 })
    .select("blog_id title publishedAt -_id")
    .limit(10)
    .then(blogs => {
        return res.status(200).json({ blogs })
    })
    .catch(err => {
        return res.status(500).json({ error: err.message })
    })

})

server.post("/search-blogs", (req, res) => {

    let { tag, query, author, page, limit, eliminate_blog } = req.body;

    let findQuery;

    if(tag){
        findQuery = { tags: tag, draft: false, blog_id: { $ne: eliminate_blog } };
    } else if(query){
        findQuery = { draft: false, title: new RegExp(query, 'i') } 
    } else if(author) {
        findQuery = { author, draft: false }
    }

    let maxLimit = limit ? limit : 2;
    
    Blog.find(findQuery)
    .populate("author", "personal_info.profile_img personal_info.username personal_info.fullname -_id")
    .sort({ "publishedAt": -1 })
    .select("blog_id title des banner activity tags publishedAt -_id")
    .skip((page - 1) * maxLimit)
    .limit(maxLimit)
    .then(blogs => {
        return res.status(200).json({ blogs })
    })
    .catch(err => {
        return res.status(500).json({ error: err.message })
    })

})

server.post("/search-blogs-count", (req, res) => {

    let { tag, author, query } = req.body;

    let findQuery;

    if(tag){
        findQuery = { tags: tag, draft: false };
    } else if(query){
        findQuery = { draft: false, title: new RegExp(query, 'i') } 
    } else if(author) {
        findQuery = { author, draft: false }
    }

    Blog.countDocuments(findQuery)
    .then(count => {
        return res.status(200).json({ totalDocs: count })
    })
    .catch(err => {
        console.log(err.message);
        return res.status(500).json({ error: err.message })
    })

})

server.post("/search-users", (req, res) => {

    let { query } = req.body;

    User.find({ "personal_info.username": new RegExp(query, 'i') })
    .limit(50)
    .select("personal_info.fullname personal_info.username personal_info.profile_img -_id")
    .then(users => {
        return res.status(200).json({ users })
    })
    .catch(err => {
        return res.status(500).json({ error: err.message })
    })

})

server.post("/get-profile", (req, res) => {

    let { username } = req.body;

    User.findOne({ "personal_info.username": username })
    .select("-personal_info.password -google_auth -updatedAt -blogs ")
    .then(user => {
        return res.status(200).json(user)
    })
    .catch(err => {
        console.log(err);
        return res.status(500).json({ error: err.message })
    })

})

server.post("/update-profile-img", verifyJWT, (req, res) => {

    let { url } = req.body;

    User.findOneAndUpdate({ _id: req.user }, { "personal_info.profile_img": url })
    .then(() => {
        return res.status(200).json({ profile_img: url })
    })
    .catch(err => {
        return res.status(500).json({ error: err.message })
    })

})

server.post("/update-profile", verifyJWT, (req, res) => {

    let { username, bio, social_links, fullname } = req.body;

    let bioLimit = 500;

    if(username.length < 3){
        return res.status(403).json({ error: "Username should be at least 3 letters long" });
    }

    if(bio.length > bioLimit){
        return res.status(403).json({ error: `Bio should not be more than ${bioLimit} characters` });
    }

    let socialLinksArr = Object.keys(social_links);

    try {

        for(let i = 0; i < socialLinksArr.length; i++){
            if(social_links[socialLinksArr[i]].length){
                let hostname = new URL(social_links[socialLinksArr[i]]).hostname; 

                if(!hostname.includes(`${socialLinksArr[i]}.com`) && socialLinksArr[i] != 'website'){
                    return res.status(403).json({ error: `${socialLinksArr[i]} link is invalid. You must enter a full link` })
                }

            }
        }

    } catch (err) {
        return res.status(500).json({ error: "You must provide full social links with http(s) included" })
    }

    let updateObj = {
        "personal_info.username": username,
        "personal_info.bio": bio,
        "personal_info.fullname": fullname,
        social_links
    }

    User.findOneAndUpdate({ _id: req.user }, updateObj, {
        runValidators: true
    })
    .then(() => {
        return res.status(200).json({ username })
    })
    .catch(err => {
        if(err.code == 11000){
            return res.status(409).json({ error: "username is already taken" })
        }
        return res.status(500).json({ error: err.message })
    })

})

server.post('/create-blog', verifyJWT, (req, res) => {

    let authorId = req.user;

    let { title, des, banner, tags, content, draft, id } = req.body;

    if(!title.length){
        return res.status(403).json({ error: "You must provide a title" });
    }

    if(!draft){
        if(!des.length || des.length > 500){
            return res.status(403).json({ error: "You must provide blog description under 200 characters" });
        }
    
        if(!banner.length){
            return res.status(403).json({ error: "You must provide blog banner to publish it" });
        }
    
        if(!content.blocks.length){
            return res.status(403).json({ error: "There must be some blog content to publish it" });
        }
    
        if(!tags.length || tags.length > 10){
            return res.status(403).json({ error: "Provide tags in order to publish the blog, Maximum 10" });
        }
    }

    tags = tags.map(tag => tag.toLowerCase());

    let blog_id = id || title.replace(/[^a-zA-Z0-9]/g, ' ').replace(/\s+/g, "-").trim() + nanoid();

    if(id){

        Blog.findOneAndUpdate({ blog_id }, { title, des, banner, content, tags, draft: draft ? draft : false })
        .then(() => {
            return res.status(200).json({ id: blog_id });
        })
        .catch(err => {
            return res.status(500).json({ error: "Failed to update total posts number" })
        })

    } else{

        let blog = new Blog({
            title, des, banner, content, tags, author: authorId, blog_id, draft: Boolean(draft)
        })
    
        blog.save().then(blog => {
    
            let incrementVal = draft ? 0 : 1;
    
            User.findOneAndUpdate({ _id: authorId }, { $inc : { "account_info.total_posts" : incrementVal }, $push : { "blogs": blog._id } })
            .then(user => {
                return res.status(200).json({ id: blog.blog_id })
            })
            .catch(err => {
                return res.status(500).json({ error: "Failed to update total posts number" })
            })
    
        })
        .catch(err => {
            return res.status(500).json({ error: err.message })
        })

    }

})

server.post("/get-blog", (req, res) => {

    let { blog_id, draft, mode } = req.body;

    let incrementVal = mode != 'edit' ? 1 : 0;

    Blog.findOneAndUpdate({ blog_id }, { $inc : { "activity.total_reads": incrementVal } })
    .populate("author", "personal_info.fullname personal_info.username personal_info.profile_img")
    .select("title des content banner activity publishedAt blog_id tags")
    .then(blog => {

        User.findOneAndUpdate({ "personal_info.username": blog.author.personal_info.username }, { 
            $inc : { "account_info.total_reads": incrementVal }
        })
        .catch(err => {
            return res.status(500).json({ error: err.message })
        })

        if(blog.draft && !draft){
            return res.status(500).json({ error: 'you can not access draft blogs' })
        }

        return res.status(200).json({ blog });

    })
    .catch(err => {
        return res.status(500).json({ error: err.message });
    })

})

server.post("/like-blog", verifyJWT, (req, res) => {

    let user_id = req.user;

    let { _id, islikedByUser } = req.body;

    let incrementVal = !islikedByUser ? 1 : -1;

    Blog.findOneAndUpdate({ _id }, { $inc: { "activity.total_likes": incrementVal } })
    .then(blog => {

        if(!islikedByUser){
            let like = new Notification({
                type: "like",
                blog: _id,
                notification_for: blog.author,
                user: user_id
            })

            like.save().then(notification => {
                return res.status(200).json({ liked_by_user: true })
            })
        } else{

            Notification.findOneAndDelete({ user: user_id, blog: _id, type: "like" })
            .then(data => {
                return res.status(200).json({ liked_by_user: false })
            })
            .catch(err => {
                return res.status(500).json({ error: err.message });
            })

        }

    })

})

server.post("/isliked-by-user", verifyJWT, (req, res) => {
    
    let user_id = req.user;

    let { _id } = req.body;

    Notification.exists({ user: user_id, type: "like", blog: _id })
    .then(result => {
        return res.status(200).json({ result }) 
    })
    .catch(err => {
        return res.status(500).json({ error: err.message })
    })

}) 

server.post("/add-comment", verifyJWT, (req, res) => {

    let user_id = req.user;

    let { _id, comment, blog_author, replying_to, notification_id } = req.body;

    if(!comment.length) {
        return res.status(403).json({ error: 'Write something to leave a comment' });
    }

    // creating a comment doc
    let commentObj = {
        blog_id: _id, blog_author, comment, commented_by: user_id,
    }

    if(replying_to){
        commentObj.parent = replying_to;
        commentObj.isReply = true;
    }

    new Comment(commentObj).save().then(async commentFile => {

        let { comment, commentedAt, children } = commentFile;

        Blog.findOneAndUpdate({ _id }, { $push: { "comments": commentFile._id }, $inc : { "activity.total_comments": 1, "activity.total_parent_comments": replying_to ? 0 : 1 },  })
        .then(blog => { console.log('New comment created') });

        let notificationObj = {
            type: replying_to ? "reply" : "comment",
            blog: _id,
            notification_for: blog_author,
            user: user_id,
            comment: commentFile._id
        }

        if(replying_to){

            notificationObj.replied_on_comment = replying_to;

            await Comment.findOneAndUpdate({ _id: replying_to }, { $push: { children: commentFile._id } })
            .then(replyingToCommentDoc => { notificationObj.notification_for = replyingToCommentDoc.commented_by })

            if(notification_id){
                Notification.findOneAndUpdate({ _id: notification_id }, { reply: commentFile._id })
                .then(notificaiton => console.log('notification updated'))
            }

        }

        new Notification(notificationObj).save().then(notification => console.log('new notification created'));

        return res.status(200).json({
            comment, commentedAt, _id: commentFile._id, user_id, children
        })

    })


}) 

server.post("/get-blog-comments", (req, res) => {

    let { blog_id, skip } = req.body;

    let maxLimit = 5;

    Comment.find({ blog_id, isReply: false })
    .populate("commented_by", "personal_info.username personal_info.fullname personal_info.profile_img")
    .skip(skip)
    .limit(maxLimit)
    .sort({
        'commentedAt': -1
    })
    .then(comment => {
        console.log(comment, blog_id, skip)
        return res.status(200).json(comment);
    })
    .catch(err => {
        console.log(err.message);
        return res.status(500).json({ error: err.message })
    })

})

server.post("/get-replies", (req, res) => {

    let { _id, skip } = req.body;

    let maxLimit = 5;

    Comment.findOne({ _id })
    .populate({
        path: "children",
        options: {
            limit: maxLimit,
            skip: skip,
            sort: { 'commentedAt': -1 }
        },
        populate: {
            path: 'commented_by',
            select: "personal_info.profile_img personal_info.fullname personal_info.username"
        },
        select: "-blog_id -updatedAt"
    })
    .select("children")
    .then(doc => {
        console.log(doc);
        return res.status(200).json({ replies: doc.children })
    })
    .catch(err => {
        return res.status(500).json({ error: err.message })
    })

})

const deleteComments = ( _id ) => {
    Comment.findOneAndDelete({ _id })
    .then(comment => {

        if(comment.parent){
            Comment.findOneAndUpdate({ _id: comment.parent }, { $pull: { children: _id } })
            .then(data => console.log('comment delete from parent'))
            .catch(err => console.log(err));
        }

        Notification.findOneAndDelete({ comment: _id }).then(notification => console.log('comment notification deleted'))

        Notification.findOneAndUpdate({ reply: _id }, { $unset: { reply: 1 } }).then(notification => console.log('reply notification deleted'))

        Blog.findOneAndUpdate({ _id: comment.blog_id }, { $pull: { comments: _id }, $inc: { "activity.total_comments": -1 }, "activity.total_parent_comments": comment.parent ? 0 : -1 })
        .then(blog => {
            if(comment.children.length){
                comment.children.map(replies => {
                    deleteComments(replies)
                })
            }   
        })

    })
    .catch(err => {
        console.log(err.message);
    })
}

server.post("/delete-comment", verifyJWT, (req, res) => {

    let user_id = req.user;

    let { _id } = req.body;

    Comment.findOne({ _id })
    .then(comment => {

        if( user_id == comment.commented_by || user_id == comment.blog_author ){

            deleteComments(_id)

            return res.status(200).json({ status: 'done' });

        } else{
            return res.status(403).json({ error: "You can not delete this commet" })
        }

    })

})

server.get("/new-notification", verifyJWT, (req, res) => {

    let user_id = req.user;

    Notification.exists({ notification_for: user_id, seen: false, user: { $ne: user_id } })
    .then(result => {
        if( result ){
            return res.status(200).json({ new_notification_available: true })
        } else{
            return res.status(200).json({ new_notification_available: false })
        }
    })
    .catch(err => {
        console.log(err.message);
        return res.status(500).json({ error: err.message })
    })

})

server.post("/notifications", verifyJWT, (req, res) => {
    let user_id = req.user;

    let { page, filter, deletedDocCount } = req.body;

    let maxLimit = 10;

    let findQuery = { notification_for: user_id, user: { $ne: user_id } };

    let skipDocs = ( page - 1 ) * maxLimit;

    if(filter != 'all'){
        findQuery.type = filter;
    }

    if(deletedDocCount){
        skipDocs -= deletedDocCount;
    }

    Notification.find(findQuery)
    .skip(skipDocs)
    .limit(maxLimit)
    .populate("blog", "title blog_id")
    .populate("user", "personal_info.fullname personal_info.username personal_info.profile_img")
    .populate("comment", "comment")
    .populate("replied_on_comment", "comment")
    .populate("reply", "comment")
    .sort({ createdAt: -1 })
    .select("createdAt type seen reply")
    .then(notifications => {

        Notification.updateMany(findQuery, { seen: true })
        .skip(skipDocs)
        .limit(maxLimit)
        .then(() => console.log('notification seen'));

        return res.status(200).json({ notifications });

    })
    .catch(err => {
        console.log(err.message);
        return res.status(500).json({ error: err.message });
    })

})

server.post("/all-notifications-count", verifyJWT, (req, res) => {

    let user_id = req.user;

    let { filter } = req.body;

    let findQuery = { notification_for: user_id, user: { $ne: user_id } }

    if(filter != 'all'){
        findQuery.type = filter;
    }

    Notification.countDocuments(findQuery)
    .then(count => {
        return res.status(200).json({ totalDocs: count })
    })
    .catch(err => {
        return res.status(500).json({ error: err.message })
    })

})

server.post("/user-written-blogs", verifyJWT, (req, res) => {

    let user_id = req.user;

    let { page, draft, query, deletedDocCount } = req.body;

    let maxLimit = 5;
    let skipDocs = (page - 1) * maxLimit;

    if(deletedDocCount){
        skipDocs -= deletedDocCount;
    }

    Blog.find({ author: user_id, draft, title: new RegExp(query, 'i') })
    .skip(skipDocs)
    .limit(maxLimit)
    .sort({ publishedAt: -1 })
    .select(" title banner publishedAt blog_id activity des draft -_id ")
    .then(blogs => {
        return res.status(200).json({ blogs })
    })
    .catch(err => {
        return res.status(500).json({ error: err.message });
    })

})

server.post("/user-written-blogs-count", verifyJWT, (req, res) => {

    let user_id = req.user;

    let { draft, query } = req.body;

    Blog.countDocuments({ author: user_id, draft, title: new RegExp(query, 'i') })
    .then(count => {
        return res.status(200).json({ totalDocs: count })
    })
    .catch(err => {
        console.log(err.message);
        return res.status(500).json({ error: err.message });
    })

})

server.post("/delete-blog", verifyJWT, (req, res) => {

    let user_id = req.user;
    let { blog_id } = req.body;

    Blog.findOneAndDelete({ blog_id })
    .then(blog => {
        
        Notification.deleteMany({ blog: blog._id }).then(data => console.log('notifications deleted'));

        Comment.deleteMany({ blog_id: blog._id }).then(data => console.log('comments deleted'));

        User.findOneAndUpdate({ _id: user_id }, { $pull: { blog: blog._id }, $inc: { "account_info.total_posts": -1 } })
        .then(user => console.log('Blog deleted'));

        return res.status(200).json({ status: 'done' });

    })
    .catch(err => {
        return res.status(500).json({ error: err.message })
    })

})

import bodyParser from 'body-parser';
import { getStreamingCompletion } from "./src/modules/openai/index.js";

server.use(bodyParser.json());
server.use(cors());
server.use(bodyParser.urlencoded({ extended: false }));


server.post("/chat", async (req, res) => {
    const data = req.body;
    const stream = await getStreamingCompletion({ userPrompt: data?.userPrompt });
    for await (const part of stream) {
      // Uncomment below if you want to check chunk time generation
      //const chunkTime = (Date.now() - starttime) / 1000;
      //process.stdout.write(part.choices[0]?.delta || "");
      //console.log("chunk time:", chunkTime);
      res.write(part.choices[0]?.delta.content || "");
    }
    res.end();
});


// Fetch todos for a specific user
server.get('/todo/user/:username', async (req, res) => {
    try {
        const user = await User.findOne({ 'personal_info.username': req.params.username });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        const todos = await ToDo.find({ _id: { $in: user.todos } });
        res.json({ todos });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch todos' });
    }
});

// Add a new todo for a specific user
server.post('/todo/user/:username/new', async (req, res) => {
    try {
        const user = await User.findOne({ 'personal_info.username': req.params.username });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        const newTodo = new ToDo(req.body);
        await newTodo.save();
        user.todos.push(newTodo._id);
        await user.save();
        res.status(201).json({ newTodo });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to create new todo' });
    }
});

// Delete a todo for a specific user
server.delete('/todo/user/:username/delete/:id', async (req, res) => {
    try {
        const user = await User.findOne({ 'personal_info.username': req.params.username });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        const result = await ToDo.findByIdAndDelete(req.params.id);
        user.todos = user.todos.filter(todoId => todoId.toString() !== req.params.id);
        await user.save();
        res.json(result);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to delete todo' });
    }
});

// Toggle completion status of a todo for a specific user
server.put("/todo/user/:username/complete/:id", async (req, res) => {
    try {
        const user = await User.findOne({ 'personal_info.username': req.params.username });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        const todo = await ToDo.findById(req.params.id);
        if (!todo) {
            return res.status(404).json({ message: "Todo not found" });
        }
        todo.completed = !todo.completed;
        const updatedTodo = await todo.save();
        res.json(updatedTodo);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Failed to toggle completion status" });
    }
});

server.get("/todo/:username/note", async (req, res) => {
    try {
        const username = req.params.username;
        const user = await User.findOne({ 'personal_info.username': username });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        const note = await Notepad.findById(user.notepad);
        res.json(note);
    } catch (error) {
        res.status(500).json({ message: "Error fetching note" });
    }
});

server.put("/todo/:username/note", async (req, res) => {
    try {
        const username = req.params.username;
        const user = await User.findOne({ 'personal_info.username': username });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        let note = await Notepad.findById(user.notepad);
        if (!note) {
            note = new Notepad({ content: req.body.content });
            user.notepad = note._id;
            await user.save();
        } else {
            note.content = req.body.content;
        }
        await note.save();
        res.json(note);
    } catch (error) {
        res.status(500).json({ message: "Error updating note" });
    }
});



server.delete('/delete-user/:username', verifyJWT, async (req, res, next) => {
    try {
        const username = req.params.username;
        const user = await User.findOne({ "personal_info.username": username });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Check if the user is an admin or the user being deleted
        if (!req.user.isAdmin && req.user._id && user._id && req.user._id.toString() !== user._id.toString()) {
            return next(errorHandler(403, 'You are not allowed to delete this user'));
        }

        // Delete related data (notifications, blogs, comments, etc.)
        await Notification.deleteMany({ user: user._id });
        await Blog.deleteMany({ author: user._id });
        await Comment.deleteMany({ commented_by: user._id });

        // If the user has logged in with Google Auth, revoke their tokens
        if (user.google_auth) {
            await revokeGoogleTokens(user.google_token);
        }

        // Delete the user
        await User.findByIdAndDelete(user._id);

        res.status(200).json({ message: 'User has been deleted' });
    } catch (error) {
        next(error);
    }
});








server.post("/get-profile2", (req, res) => {
    let { username } = req.body;

    User.findOne({ "personal_info.username": username })
        .select("-personal_info.password -google_auth -updatedAt -blogs")
        .populate('followers', 'personal_info.username personal_info.profile_img')
        .populate('following', 'personal_info.username personal_info.profile_img')
        .then(user => {
            return res.status(200).json(user);
        })
        .catch(err => {
            console.log(err);
            return res.status(500).json({ error: err.message });
        });
});

server.post('/follow', async (req, res) => {
    const { username, followUsername } = req.body;

    try {
        const user = await User.findOne({ 'personal_info.username': username });
        const followUser = await User.findOne({ 'personal_info.username': followUsername });

        if (!user || !followUser) {
            return res.status(404).send({ message: 'User not found' });
        }

        await User.findByIdAndUpdate(user._id, { $addToSet: { following: followUser._id } });
        await User.findByIdAndUpdate(followUser._id, { $addToSet: { followers: user._id } });

        res.status(200).send({ message: 'Successfully followed' });
    } catch (err) {
        res.status(500).send({ message: 'Error following user', error: err });
    }
});

// Unfollow a user
server.post('/unfollow', async (req, res) => {
    const { username, unfollowUsername } = req.body;

    try {
        const user = await User.findOne({ 'personal_info.username': username });
        const unfollowUser = await User.findOne({ 'personal_info.username': unfollowUsername });

        if (!user || !unfollowUser) {
            return res.status(404).send({ message: 'User not found' });
        }

        await User.findByIdAndUpdate(user._id, { $pull: { following: unfollowUser._id } });
        await User.findByIdAndUpdate(unfollowUser._id, { $pull: { followers: user._id } });

        res.status(200).send({ message: 'Successfully unfollowed' });
    } catch (err) {
        res.status(500).send({ message: 'Error unfollowing user', error: err });
    }
});


// Get followers of a user
server.get('/followers/:username', async (req, res) => {
    try {
        const user = await User.findOne({ 'personal_info.username': req.params.username }).populate({
            path: 'followers',
            select: 'personal_info.username personal_info.profile_img'
        });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.status(200).json({ followers: user.followers });
    } catch (err) {
        res.status(500).json({ message: 'Error fetching followers', error: err });
    }
});

// Get following of a user
server.get('/following/:username', async (req, res) => {
    try {
        const user = await User.findOne({ 'personal_info.username': req.params.username }).populate({
            path: 'following',
            select: 'personal_info.username personal_info.profile_img'
        });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.status(200).json({ following: user.following });
    } catch (err) {
        res.status(500).json({ message: 'Error fetching following', error: err });
    }
});

server.get('/user/:username', async (req, res) => {
    try {
        const username = req.params.username;
        const user = await User.findOne({ 'personal_info.username': username });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        const userData = {
            fullname: user.personal_info.fullname,
            username: user.personal_info.username,
            profile_img: user.personal_info.profile_img,
            joinedAt: user.joinedAt,
            // Add more fields as needed
        };
        res.json(userData);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch user data' });
    }
});

server.get('/all-members', async (req, res) => {
    try {
        const members = await User.find({}).select('personal_info.username personal_info.fullname personal_info.profile_img account_info.total_posts account_info.total_reads joinedAt');
        res.status(200).json({ users: members });
    } catch (error) {
        console.error('Error fetching all members:', error);
        res.status(500).json({ message: 'Failed to fetch all members' });
    }
});

server.post('/search-members', async (req, res) => {
    const { query } = req.body;
    try {
        const regex = new RegExp(query, 'i'); // Case-insensitive regex for searching
        const members = await User.find({
            $or: [
                { 'personal_info.fullname': regex },
                { 'personal_info.username': regex }
            ]
        }).select('personal_info.username personal_info.fullname personal_info.profile_img account_info.total_posts account_info.total_reads joinedAt');

        res.status(200).json({ users: members });
    } catch (error) {
        console.error('Error searching members:', error);
        res.status(500).json({ message: 'Failed to search members' });
    }
});

server.post("/bookmark-blog", verifyJWT, async (req, res) => {
    const user_id = req.user;
    const { _id, issavedByUser } = req.body;

    const incrementVal = !issavedByUser ? 1 : -1;

    // Update the user's bookmarks array based on the bookmark action
    const updateQuery = !issavedByUser ? { $addToSet: { bookmarks: _id } } : { $pull: { bookmarks: _id } };

    try {
        // Update the user document
        await User.findByIdAndUpdate(user_id, updateQuery);

        // Update the blog's total_saved count
        await Blog.findByIdAndUpdate(_id, { $inc: { "activity.total_saved": incrementVal } });

        // Find the blog to access the author
        const blog = await Blog.findById(_id);

        if (!blog) {
            throw new Error("Blog not found");
        }

        if (!issavedByUser) {
            // Create a new notification
            const save = new Notification({
                type: "saved",
                blog: _id,
                notification_for: blog.author,
                user: user_id
            });
            await save.save();
            res.status(200).json({ saved_by_user: true });
        } else {
            // Delete the notification
            await Notification.findOneAndDelete({ user: user_id, blog: _id, type: "saved" });
            res.status(200).json({ saved_by_user: false });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});




server.post("/issaved-by-user", verifyJWT, (req, res) => {
    let user_id = req.user;

    let { _id } = req.body;

    Notification.exists({ user: user_id, type: "saved", blog: _id })
    .then(result => {
        return res.status(200).json({ result }) 
    })
    .catch(err => {
        return res.status(500).json({ error: err.message })
    })

}) 

server.get("/user-bookmarks/:username", (req, res) => {
    const username = req.params.username;

    User.findOne({ "personal_info.username": username })
        .populate("bookmarks", "title des blog_id") // Menampilkan field "title", "des", dan "blog_id" dari blog
        .then(user => {
            if (!user) {
                return res.status(404).json({ error: "User not found" });
            }

            // Mengubah format data bookmarks untuk menyertakan title, des, dan blog_id
            const formattedBookmarks = user.bookmarks.map(bookmark => {
                return {
                    _id: bookmark._id,
                    title: bookmark.title,
                    des: bookmark.des,
                    blog_id: bookmark.blog_id
                };
            });

            res.status(200).json({ bookmarks: formattedBookmarks });
        })
        .catch(err => {
            res.status(500).json({ error: err.message });
        });
});







server.listen(PORT, () => {
    console.log('listening on port -> ' + PORT);
})