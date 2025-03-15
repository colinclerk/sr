const Page = protected()
  .with({
    reverification: {
      after: "10min",
      level: "multiFactor",
    },
  })
  .with({
    entitlement: "org:foo",
  })
  .with({
    permission: "org:foo:bar",
  })
  .component(async (auth) => {});
