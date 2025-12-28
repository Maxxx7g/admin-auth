import express from "express";
import session from "express-session";
import path from "path";
import axios from "axios";

const __dirname = process.cwd();

const app = express();
const PORT = parseInt(process.env.PORT || "5000");


// GitHub Configuration
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = "Maxxx7g";
const REPO_NAME = "ElenxAUTH";
const FILE_PATH = "Database.json";
const BRANCH = "main";

const API_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`;

const getHeaders = () => ({
  Authorization: `token ${GITHUB_TOKEN}`,
  Accept: "application/vnd.github.v3+json",
});

// Admin Credentials
const ADMIN_USER = "1";
const ADMIN_PASS = "1";

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "../views"));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "secret_key_change_this",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false },
  })
);

// Auth Middleware
function isAuthenticated(req: any, res: any, next: any) {
  if (req.session.admin) {
    return next();
  }
  res.redirect("/login");
}

// GitHub Functions
async function getUsers() {
  try {
    const response = await axios.get(API_URL, { headers: getHeaders() });
    const content = Buffer.from(response.data.content, "base64").toString(
      "utf-8"
    );
    return {
      users: JSON.parse(content),
      sha: response.data.sha,
    };
  } catch (error: any) {
    console.error(
      "Error fetching users from GitHub:",
      error.response?.data || error.message
    );
    return { users: [], sha: null };
  }
}

async function updateUsers(users: any[], sha: string | null) {
  try {
    const content = Buffer.from(JSON.stringify(users, null, 2)).toString(
      "base64"
    );
    const body: any = {
      message: "Update users via Admin Panel",
      content: content,
      branch: BRANCH,
    };
    if (sha) {
      body.sha = sha;
    }

    await axios.put(API_URL, body, { headers: getHeaders() });
  } catch (error: any) {
    console.error(
      "Error updating users to GitHub:",
      error.response?.data || error.message
    );
    throw new Error("Failed to update users to GitHub");
  }
}

// Routes
app.get("/", (req, res) => {
  res.redirect("/dashboard");
});

app.get("/login", (req: any, res) => {
  res.render("login", { error: null });
});

app.post("/login", (req: any, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    req.session.admin = true;
    res.redirect("/dashboard");
  } else {
    res.render("login", { error: "Invalid credentials" });
  }
});

app.get("/logout", (req: any, res) => {
  req.session.destroy();
  res.redirect("/login");
});

app.get("/dashboard", isAuthenticated, async (req: any, res) => {
  try {
    const { users } = await getUsers();
    res.render("dashboard", {
      users: users || [],
      error: null,
      success: req.query.success,
    });
  } catch (error: any) {
    res.render("dashboard", {
      users: [],
      error: error.message,
      success: null,
    });
  }
});

// Helper wrapper for updates
async function handleUpdate(
  req: any,
  res: any,
  updateFn: (users: any[]) => any[]
) {
  try {
    const { users, sha } = await getUsers();
    const safeUsers = users || [];
    const newUsers = updateFn(safeUsers);
    await updateUsers(newUsers, sha);
    res.redirect("/dashboard?success=Operation Successful");
  } catch (error: any) {
    console.error(error);
    const { users } = await getUsers().catch(() => ({ users: [] }));
    res.render("dashboard", {
      users: users || [],
      error: "Failed to update GitHub database: " + error.message,
      success: null,
    });
  }
}

app.post("/add-user", isAuthenticated, (req: any, res) => {
  const { username, password, validity } = req.body;
  handleUpdate(req, res, (users) => {
    if (users.find((u) => u.username === username)) {
      throw new Error("User already exists");
    }
    users.push({
      username,
      password,
      hwid: "",
      blacklist: 0,
      validity: parseInt(validity) || 30,
      bind_date: "",
    });
    return users;
  });
});

app.post("/delete-user", isAuthenticated, (req: any, res) => {
  const { username } = req.body;
  handleUpdate(req, res, (users) => {
    return users.filter((u) => u.username !== username);
  });
});

app.post("/edit-password", isAuthenticated, (req: any, res) => {
  const { username, password } = req.body;
  handleUpdate(req, res, (users) => {
    const user = users.find((u) => u.username === username);
    if (user) user.password = password;
    return users;
  });
});

app.post("/change-validity", isAuthenticated, (req: any, res) => {
  const { username, validity } = req.body;
  handleUpdate(req, res, (users) => {
    const user = users.find((u) => u.username === username);
    if (user) user.validity = parseInt(validity);
    return users;
  });
});

app.post("/reset-hwid", isAuthenticated, (req: any, res) => {
  const { username } = req.body;
  handleUpdate(req, res, (users) => {
    const user = users.find((u) => u.username === username);
    if (user) {
      user.hwid = "";
      user.bind_date = "";
    }
    return users;
  });
});

app.post("/toggle-blacklist", isAuthenticated, (req: any, res) => {
  const { username } = req.body;
  handleUpdate(req, res, (users) => {
    const user = users.find((u) => u.username === username);
    if (user) {
      user.blacklist = user.blacklist === 1 ? 0 : 1;
    }
    return users;
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
