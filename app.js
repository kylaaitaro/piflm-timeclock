const employeeSelect = document.getElementById("employeeId");
const notesInput = document.getElementById("notes");
const statusBox = document.getElementById("status");
const buttons = [...document.querySelectorAll("[data-action]")];
const installButton = document.getElementById("installButton");

let callbackCounter = 0;
let deferredPrompt = null;

function setStatus(message, type) {
  statusBox.hidden = false;
  statusBox.className = `status ${type}`;
  statusBox.textContent = message;
}

function clearStatus() {
  statusBox.hidden = true;
  statusBox.textContent = "";
  statusBox.className = "status";
}

function setBusy(isBusy) {
  buttons.forEach((button) => {
    button.disabled = isBusy;
  });

  employeeSelect.disabled = isBusy;
  notesInput.disabled = isBusy;
}

function apiUrlIsValid() {
  return (
    typeof API_URL === "string" &&
    API_URL.startsWith("https://script.google.com/") &&
    API_URL.endsWith("/exec")
  );
}

function jsonpRequest(parameters) {
  return new Promise((resolve, reject) => {
    if (!apiUrlIsValid()) {
      reject(
        new Error(
          "The Apps Script backend URL is missing or incorrect in config.js."
        )
      );
      return;
    }

    const callbackName =
      `piflmCallback_${Date.now()}_${callbackCounter++}`;

    const script = document.createElement("script");

    const timeout = window.setTimeout(() => {
      cleanup();

      reject(
        new Error(
          "The request timed out. Check your internet connection and try again."
        )
      );
    }, 15000);

    function cleanup() {
      window.clearTimeout(timeout);
      delete window[callbackName];
      script.remove();
    }

    window[callbackName] = (data) => {
      cleanup();
      resolve(data);
    };

    const query = new URLSearchParams({
      ...parameters,
      callback: callbackName
    });

    script.src = `${API_URL}?${query.toString()}`;

    script.onerror = () => {
      cleanup();

      reject(
        new Error(
          "Unable to contact the PIFLM time-clock service."
        )
      );
    };

    document.body.appendChild(script);
  });
}

async function loadEmployees() {
  setStatus("Loading employees…", "loading");

  try {
    const result = await jsonpRequest({
      mode: "employees"
    });

    if (!result.ok) {
      throw new Error(
        result.message || "Unable to load employees."
      );
    }

    const employees = result.employees || [];

    employeeSelect.innerHTML =
      '<option value="">Select your employee ID</option>';

    employees.forEach((employee) => {
      const option = document.createElement("option");

      option.value = employee.id;
      option.textContent =
        `${employee.name} (${employee.id})`;

      employeeSelect.appendChild(option);
    });

    if (employees.length === 0) {
      setStatus(
        "No active employees were found in the Employees sheet.",
        "error"
      );

      return;
    }

    clearStatus();
  } catch (error) {
    employeeSelect.innerHTML =
      '<option value="">Unable to load employees</option>';

    setStatus(error.message, "error");
  }
}

async function submitPunch(action) {
  const employeeId = employeeSelect.value.trim();
  const notes = notesInput.value.trim();

  if (!employeeId) {
    setStatus(
      "Please select your employee ID.",
      "error"
    );

    employeeSelect.focus();
    return;
  }

  const readableAction =
    action === "clock in"
      ? "Clock In"
      : "Clock Out";

  setBusy(true);
  setStatus(
    `Recording ${readableAction}…`,
    "loading"
  );

  try {
    const result = await jsonpRequest({
      mode: "punch",
      employeeId,
      action,
      notes
    });

    if (!result.ok) {
      throw new Error(
        result.message ||
        "The punch could not be recorded."
      );
    }

    const confirmation = [
      result.message,
      result.timestamp
    ]
      .filter(Boolean)
      .join("\n");

    setStatus(
      confirmation,
      "success"
    );

    notesInput.value = "";
  } catch (error) {
    setStatus(
      error.message,
      "error"
    );
  } finally {
    setBusy(false);
  }
}

buttons.forEach((button) => {
  button.addEventListener("click", () => {
    submitPunch(button.dataset.action);
  });
});

window.addEventListener(
  "beforeinstallprompt",
  (event) => {
    event.preventDefault();
    deferredPrompt = event;
    installButton.hidden = false;
  }
);

installButton.addEventListener(
  "click",
  async () => {
    if (!deferredPrompt) {
      return;
    }

    deferredPrompt.prompt();
    await deferredPrompt.userChoice;

    deferredPrompt = null;
    installButton.hidden = true;
  }
);

window.addEventListener(
  "appinstalled",
  () => {
    installButton.hidden = true;
  }
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./service-worker.js")
      .catch((error) => {
        console.error(
          "Service worker registration failed:",
          error
        );
      });
  });
}

loadEmployees();
