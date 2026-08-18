const employeeSelect =
  document.getElementById("employeeId");

const notesInput =
  document.getElementById("notes");

const statusBox =
  document.getElementById("status");

const buttons = [
  ...document.querySelectorAll("[data-action]")
];

const installButton =
  document.getElementById("installButton");

const notificationButton =
  document.getElementById("enableNotifications");


let callbackCounter = 0;
let deferredPrompt = null;


/* =====================================================
   STATUS MESSAGES
===================================================== */

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


/* =====================================================
   APPS SCRIPT BACKEND
===================================================== */

function apiUrlIsValid() {
  return (
    typeof API_URL === "string" &&
    API_URL.startsWith(
      "https://script.google.com/"
    ) &&
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


    const script =
      document.createElement("script");


    const timeout =
      window.setTimeout(() => {

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


    window[callbackName] =
      (data) => {

        cleanup();

        resolve(data);
      };


    const query =
      new URLSearchParams({
        ...parameters,
        callback: callbackName
      });


    script.src =
      `${API_URL}?${query.toString()}`;


    script.onerror =
      () => {

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


/* =====================================================
   LOAD EMPLOYEES
===================================================== */

async function loadEmployees() {

  setStatus(
    "Loading employees…",
    "loading"
  );


  try {

    const result =
      await jsonpRequest({
        mode: "employees"
      });


    if (!result.ok) {
      throw new Error(
        result.message ||
        "Unable to load employees."
      );
    }


    const employees =
      result.employees || [];


    employeeSelect.innerHTML =
      '<option value="">Select your employee ID</option>';


    employees.forEach((employee) => {

      const option =
        document.createElement("option");


      option.value =
        employee.id;


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


    setStatus(
      error.message,
      "error"
    );
  }
}


/* =====================================================
   CLOCK IN / CLOCK OUT
===================================================== */

async function submitPunch(action) {

  const employeeId =
    employeeSelect.value.trim();


  const notes =
    notesInput.value.trim();


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

    const result =
      await jsonpRequest({
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


/* =====================================================
   CLOCK BUTTONS
===================================================== */

buttons.forEach((button) => {

  button.addEventListener(
    "click",
    () => {

      submitPunch(
        button.dataset.action
      );

    }
  );

});


/* =====================================================
   ONESIGNAL PUSH NOTIFICATIONS
===================================================== */


/*
 * Updates the reminder button depending on
 * notification permission.
 */
function setNotificationButtonState(
  enabled,
  message
) {

  if (!notificationButton) {
    return;
  }


  if (enabled) {

    notificationButton.textContent =
      "✓ Clock Reminders Enabled";


    notificationButton.disabled =
      true;


    return;
  }


  notificationButton.textContent =
    message ||
    "🔔 Enable Clock Reminders";


  notificationButton.disabled =
    false;
}


/*
 * Ask OneSignal/browser for permission.
 *
 * This function runs only after the user
 * taps the Enable Clock Reminders button.
 */
function enableClockReminders() {

  if (!notificationButton) {
    return;
  }


  notificationButton.disabled =
    true;


  notificationButton.textContent =
    "Enabling reminders…";


  window.OneSignalDeferred =
    window.OneSignalDeferred || [];


  OneSignalDeferred.push(
    async function (OneSignal) {

      try {

        /*
         * Check whether this browser/device
         * supports Web Push.
         */
        const supported =
          OneSignal.Notifications
            .isPushSupported();


        if (!supported) {

          setNotificationButtonState(
            false,
            "Notifications unavailable on this device"
          );


          notificationButton.disabled =
            true;


          setStatus(
            "Push notifications are not supported in this browser. On iPhone, open the installed PIFLM Time Clock from your Home Screen and try again.",
            "error"
          );


          return;
        }


        /*
         * Already allowed?
         */
        if (
          OneSignal.Notifications
            .permission
        ) {

          setNotificationButtonState(
            true
          );


          setStatus(
            "Clock reminders are already enabled on this device.",
            "success"
          );


          return;
        }


        /*
         * Display the browser/phone
         * notification permission request.
         */
        await OneSignal.Notifications
          .requestPermission();


        /*
         * Check the result.
         */
        if (
          OneSignal.Notifications
            .permission
        ) {

          setNotificationButtonState(
            true
          );


          setStatus(
            "Clock reminders are enabled on this device.",
            "success"
          );

        } else {

          setNotificationButtonState(
            false,
            "🔔 Enable Clock Reminders"
          );


          setStatus(
            "Clock reminders were not enabled. You can try again or check your notification settings.",
            "error"
          );
        }


      } catch (error) {

        console.error(
          "OneSignal notification error:",
          error
        );


        setNotificationButtonState(
          false,
          "🔔 Enable Clock Reminders"
        );


        setStatus(
          "Unable to enable clock reminders right now. Please try again.",
          "error"
        );
      }

    }
  );
}


/*
 * Connect the button.
 */
if (notificationButton) {

  notificationButton.addEventListener(
    "click",
    enableClockReminders
  );

}


/*
 * Check notification status after
 * OneSignal finishes loading.
 */
window.OneSignalDeferred =
  window.OneSignalDeferred || [];


OneSignalDeferred.push(
  async function (OneSignal) {

    try {

      const supported =
        OneSignal.Notifications
          .isPushSupported();


      if (!notificationButton) {
        return;
      }


      if (!supported) {

        notificationButton.textContent =
          "Notifications unavailable";


        notificationButton.disabled =
          true;


        return;
      }


      if (
        OneSignal.Notifications
          .permission
      ) {

        setNotificationButtonState(
          true
        );

      } else {

        setNotificationButtonState(
          false,
          "🔔 Enable Clock Reminders"
        );
      }


      /*
       * Listen for the user changing
       * notification permission.
       */
      OneSignal.Notifications
        .addEventListener(
          "permissionChange",
          function (permission) {

            if (permission) {

              setNotificationButtonState(
                true
              );

            } else {

              setNotificationButtonState(
                false,
                "🔔 Enable Clock Reminders"
              );
            }

          }
        );


    } catch (error) {

      console.error(
        "Unable to initialize reminder button:",
        error
      );

    }

  }
);


/* =====================================================
   INSTALL TIME CLOCK
===================================================== */

window.addEventListener(
  "beforeinstallprompt",
  (event) => {

    event.preventDefault();

    deferredPrompt =
      event;


    if (installButton) {
      installButton.hidden =
        false;
    }

  }
);


if (installButton) {

  installButton.addEventListener(
    "click",
    async () => {

      if (!deferredPrompt) {
        return;
      }


      deferredPrompt.prompt();


      await deferredPrompt.userChoice;


      deferredPrompt =
        null;


      installButton.hidden =
        true;

    }
  );

}


window.addEventListener(
  "appinstalled",
  () => {

    if (installButton) {

      installButton.hidden =
        true;

    }

  }
);


/* =====================================================
   EXISTING PWA SERVICE WORKER
===================================================== */

if ("serviceWorker" in navigator) {

  window.addEventListener(
    "load",
    () => {

      navigator.serviceWorker
        .register(
          "./service-worker.js"
        )
        .catch((error) => {

          console.error(
            "Service worker registration failed:",
            error
          );

        });

    }
  );

}


/* =====================================================
   START APP
===================================================== */

loadEmployees();
