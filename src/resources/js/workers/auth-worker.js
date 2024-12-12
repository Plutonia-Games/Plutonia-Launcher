"use strict";

const url = "https://api.plutonia-mc.fr/auth";

class AuthWorker {
  async auth(username, password) {
    return this.auth(username, password, "");
  }

  async auth(username, password, tfaCode) {
    const encodedPassword = encodeURIComponent(password);
    const postData =
      "username=" +
      username +
      "&password=" +
      encodedPassword +
      (tfaCode ? "&tfa=" + tfaCode : "");

    const response = await fetch(url, {
      method: "POST",

      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },

      body: postData,
    });

    const jsonResponse = await response.json();

    const status = jsonResponse.status;

    if (status === "200") {
      const session = jsonResponse.session;
      const uuid = jsonResponse.uuid;

      return {
        name: username,
        token: session,
        uuid: uuid,
      };
    }

    if (status === "400") {
      return { error: true, type: "tfa" };
    }

    throw new Error(jsonResponse.message);
  }
}

module.exports = AuthWorker;
