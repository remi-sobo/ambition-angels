import YGBPage from "./YGBPage";

// Returning families get the private link /ygb?early=true. We read the param
// on the server so earlyAccess is known before the client form computes its
// initial state (the form seeds returning_family / early_access from it).
export default function Page({ searchParams }) {
  const earlyAccess = searchParams?.early === "true";
  return <YGBPage earlyAccess={earlyAccess} />;
}
