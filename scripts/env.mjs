export const env = (name, fallback = "") => {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
};

export const requiredEnv = (name) => {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};
