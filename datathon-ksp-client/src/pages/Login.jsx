import React from "react";

const Login = () => {
  return (
    <>
      <h1>Login Page</h1>
      <form>
        <div>
          <label htmlFor="username">Employee KGID:</label>
          <input type="text" id="username" name="username" />
        </div>
        <div>
          <label htmlFor="password">Password:</label>
          <input type="password" id="password" name="password" />
        </div>
        <button type="submit">Login</button>
      </form>
    </>
  );
};

export default Login;
