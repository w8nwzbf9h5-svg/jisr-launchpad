// The road to mainnet, as shown on the home page. Edit the numbers here; nothing else needs to change.
//   coin          the project's meme coin on pump.fun (Solana mainnet). Its market cap is read live.
//   feedbackOnX   pieces of tester feedback received on X or by email, counted by hand. Reports on GitHub are counted live.
window.JISR_LAUNCH = {
  coin: "GaWqCRMjHVZD6JNG9yDt9c9eLN1nZnQRJmR4w2zEpump",
  ticker: "LPAD",
  feedbackGoal: 100,
  capGoal: 1000000,
  feedbackOnX: 0,
  repo: "w8nwzbf9h5-svg/jisr-launchpad",
  // Contact form: the address the messages go to. The form posts to FormSubmit (formsubmit.co), which emails
  // them on. `contactKey` may be the address itself or the random string FormSubmit gives after the address
  // is confirmed, which keeps the address out of the request.
  contactEmail: "feedback@landingpad.fun",
  contactKey: "feedback@landingpad.fun"
};
