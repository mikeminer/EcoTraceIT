import {redirect} from "react-router";
export const loader = async () => redirect("/app");
export default function LegacyRoute() { return null; }
