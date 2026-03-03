import { render, screen } from "@testing-library/react";
import App from "../App";

test("renders connector shell", () => {
  render(<App />);
  expect(screen.getByText("OpenClaw Connector")).toBeInTheDocument();
});
