async function main() {
  try {
    const port = process.env.PORT || "3002";

    const response = await fetch(
      `http://127.0.0.1:${port}/api/health`,
      { signal: AbortSignal.timeout(5000) }
    );

    if (!response.ok) {
      throw new Error("HTTP " + response.status);
    }

    const body = await response.json();

    if (body.status !== "UP") {
      throw new Error("Gateway is not ready");
    }

    console.log(JSON.stringify(body));
  } catch (error) {
    console.error("FAIL:", error.message);
    process.exitCode = 1;
  }
}

main();
