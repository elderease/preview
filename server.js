const express = require("express");
const { Sequelize, DataTypes } = require("sequelize");

const path = require("path");
const fs = require("fs");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

const cors = require("cors");
app.options("*", cors());

app.use(
  cors({
    origin: "https://incomparable-taiyaki-956d9f.netlify.app",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);
app.options("*", cors());

app.use(express.json());
// Database connection
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: "postgres",
  protocol: "postgres",
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false,
    },
  },
});
sequelize
  .authenticate()
  .then(() => console.log("Database connected successfully"))
  .catch((err) => console.error("Unable to connect to the database:", err));
// Define models
const User = sequelize.define("User", {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    allowNull: false,
  },
  username: DataTypes.STRING,
  password: DataTypes.STRING,
  userType: DataTypes.STRING,
  firstName: DataTypes.STRING,
  lastName: DataTypes.STRING,
  phoneNumber: DataTypes.STRING,
  address: DataTypes.STRING,
  languages: DataTypes.ARRAY(DataTypes.STRING),
  birthDate: DataTypes.DATE,
  transportation: DataTypes.ARRAY(DataTypes.STRING),
  ratings: DataTypes.ARRAY(DataTypes.INTEGER),
  averageRating: DataTypes.FLOAT,
});

const Task = sequelize.define("Task", {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    allowNull: false,
  },
  title: DataTypes.STRING,
  description: DataTypes.TEXT,
  elderlyId: DataTypes.BIGINT,
  volunteerId: DataTypes.BIGINT,
  status: DataTypes.STRING,
  image: DataTypes.STRING,
  createdAt: DataTypes.DATE,
  completedAt: DataTypes.DATE,
  elderlyConfirmed: DataTypes.BOOLEAN,
  rating: DataTypes.INTEGER,
  archived: DataTypes.BOOLEAN,
});

const Message = sequelize.define("Message", {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    allowNull: false,
  },
  senderId: DataTypes.BIGINT,
  senderName: DataTypes.STRING,
  content: DataTypes.TEXT,
  timestamp: DataTypes.DATE,
  taskId: DataTypes.BIGINT,
});

const Notification = sequelize.define("Notification", {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    allowNull: false,
  },
  userId: DataTypes.BIGINT,
  title: DataTypes.STRING,
  message: DataTypes.TEXT,
  taskId: DataTypes.BIGINT,
  read: DataTypes.BOOLEAN,
  createdAt: DataTypes.DATE,
});

// Sync models with database
sequelize.sync({ force: true }).then(() => {
  console.log("Database synchronized");
});

// Helper function to create notifications
const createNotification = async (userId, title, message, taskId) => {
  console.log(`Creating notification for user ${userId}`);
  const newNotification = await Notification.create({
    userId,
    title,
    message,
    taskId,
    read: false,
    createdAt: new Date(),
  });
  console.log(`Notification added to database for user ${userId}`);
  return newNotification;
};

// Root route for API health check
app.get("/", (req, res) => {
  res.send("ElderEase API is running");
});

// Routes
app.post("/tasks", async (req, res) => {
  try {
    const newTask = await Task.create(req.body);
    console.log("New task created:", newTask);

    const volunteers = await User.findAll({ where: { userType: "volunteer" } });
    console.log(`Found ${volunteers.length} volunteers to notify`);

    for (const volunteer of volunteers) {
      await createNotification(
        volunteer.id,
        "New Task Available",
        `A new task "${newTask.title}" is available.`,
        newTask.id
      );
    }

    res.status(201).json(newTask);
  } catch (error) {
    console.error("Error creating task:", error);
    res.status(500).json({ error: "Error creating task" });
  }
});

app.patch("/tasks/:id", async (req, res) => {
  const taskId = req.params.id;
  const { status, volunteerId, elderlyConfirmed, rating } = req.body;

  try {
    const task = await Task.findByPk(taskId);
    if (!task) {
      return res
        .status(404)
        .json({ success: false, message: "Task not found" });
    }

    await task.update(req.body);

    if (status === "Accepted") {
      const volunteer = await User.findByPk(volunteerId);
      await createNotification(
        task.elderlyId,
        "Task Accepted",
        `Your task "${task.title}" has been accepted by ${volunteer.firstName} ${volunteer.lastName}.`,
        taskId
      );
    } else if (status === "Completed") {
      await createNotification(
        task.elderlyId,
        "Task Completed",
        `Your task "${task.title}" has been marked as completed. Please confirm and rate the volunteer.`,
        taskId
      );
      await createNotification(
        task.volunteerId,
        "Task Completed",
        `You have marked the task "${task.title}" as completed. Waiting for elderly confirmation.`,
        taskId
      );
    } else if (elderlyConfirmed && rating) {
      await createNotification(
        task.volunteerId,
        "Task Rated",
        `The task "${task.title}" has been confirmed completed and you've received a rating of ${rating}.`,
        taskId
      );
    }

    res.json({ success: true, message: "Task updated successfully" });
  } catch (error) {
    console.error("Error updating task:", error);
    res.status(500).json({ success: false, message: "Error updating task" });
  }
});

app.patch("/tasks/:id/archive", async (req, res) => {
  const taskId = req.params.id;

  try {
    const task = await Task.findByPk(taskId);
    if (task && task.status === "Completed" && task.elderlyConfirmed) {
      await task.update({ archived: true });
      res.json({ success: true, message: "Task archived successfully" });
    } else {
      res
        .status(400)
        .json({ success: false, message: "Task cannot be archived" });
    }
  } catch (error) {
    console.error("Error archiving task:", error);
    res.status(500).json({ success: false, message: "Error archiving task" });
  }
});

app.post("/uploads", (req, res) => {
  const uploadsDir = path.join(__dirname, "uploads");
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
  }

  const id = Date.now().toString();
  const base64Data = req.body.base64.replace(/^data:image\/\w+;base64,/, "");
  const buffer = Buffer.from(base64Data, "base64");
  const filePath = path.join(uploadsDir, `${id}.png`);

  fs.writeFile(filePath, buffer, (err) => {
    if (err) {
      console.error("Error writing upload file:", err);
      return res.status(500).json({ error: "Error saving upload" });
    }
    res.status(201).json({ id: `${id}.png` });
  });
});

app.get("/tasks/:id/messages", async (req, res) => {
  const taskId = req.params.id;
  try {
    const messages = await Message.findAll({ where: { taskId: taskId } });
    res.json(messages);
  } catch (error) {
    console.error("Error fetching messages:", error);
    res.status(500).json({ error: "Error fetching messages" });
  }
});

app.post("/tasks/:id/messages", async (req, res) => {
  const taskId = req.params.id;
  try {
    const newMessage = await Message.create({ ...req.body, taskId: taskId });
    const task = await Task.findByPk(taskId);
    const recipientId =
      newMessage.senderId === task.elderlyId
        ? task.volunteerId
        : task.elderlyId;

    await createNotification(
      recipientId,
      "New Message",
      `You have a new message in task "${task.title}".`,
      taskId
    );

    res.status(201).json(newMessage);
  } catch (error) {
    console.error("Error creating message:", error);
    res.status(500).json({ error: "Error creating message" });
  }
});

app.patch("/users/:id/rate", async (req, res) => {
  const { id } = req.params;
  const { rating, taskId } = req.body;

  try {
    const user = await User.findByPk(id);
    const task = await Task.findByPk(taskId);

    if (!user || !task) {
      return res.status(404).json({ error: "User or task not found" });
    }

    user.ratings = user.ratings || [];
    user.ratings.push(rating);
    user.averageRating =
      user.ratings.reduce((a, b) => a + b) / user.ratings.length;
    await user.save();

    task.rating = rating;
    await task.save();

    await createNotification(
      user.id,
      "New Rating Received",
      `You received a new rating of ${rating} for the task "${task.title}".`,
      taskId
    );

    res.json(user);
  } catch (error) {
    console.error("Error rating user:", error);
    res.status(500).json({ error: "Error rating user" });
  }
});

app.patch("/notifications/:id", async (req, res) => {
  const notificationId = req.params.id;
  try {
    const notification = await Notification.findByPk(notificationId);
    if (notification) {
      await notification.update({ read: true });
      res.json({ success: true, message: "Notification marked as read" });
    } else {
      res
        .status(404)
        .json({ success: false, message: "Notification not found" });
    }
  } catch (error) {
    console.error("Error updating notification:", error);
    res
      .status(500)
      .json({ success: false, message: "Error updating notification" });
  }
});

// Serve uploaded files
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

//
app.get("/users", async (req, res) => {
  try {
    const users = await User.findAll();
    res.json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/fetch-tasks", async (req, res) => {
  try {
    const tasks = await Task.findAll();
    res.json(tasks);
  } catch (error) {
    console.error("Error fetching tasks:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/notifications", async (req, res) => {
  const { userId } = req.query;
  try {
    const notifications = await Notification.findAll({
      where: { userId },
      order: [["createdAt", "DESC"]],
    });
    res.json(notifications);
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({ error: "Error fetching notifications" });
  }
});

app.get("/tasks", async (req, res) => {
  try {
    const tasks = await Task.findAll();
    res.json(tasks);
  } catch (error) {
    console.error("Error fetching tasks:", error);
    res.status(500).json({ error: "Error fetching tasks" });
  }
});

app.post("/login", async (req, res) => {
  console.log("Login route hit", req.body);
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ where: { username } });
    if (user && user.password === password) {
      const { password, ...userWithoutPassword } = user.toJSON();
      res.json(userWithoutPassword);
    } else {
      res.status(401).json({ error: "Invalid username or password" });
    }
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
app.use((req, res) => {
  res.status(404).send("Not Found");
});
