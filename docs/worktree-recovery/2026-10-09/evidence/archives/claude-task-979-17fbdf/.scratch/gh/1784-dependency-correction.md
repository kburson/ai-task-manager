### Dependency correction

When defect #1809 was created to address the delivery-verification policy blocking #1784, I did not add the native blocked-by edge. I caught that omission after the story owner asked whether #1784 was formally dependent on #1809. The earlier #1787 dependency remains historical; #1787 is closed, while #1809 is the open defect whose resolution is needed before ordinary governed delivery of #1784 can proceed.

I am adding #1809 as a native blocker of #1784 through AITM's governed `block` command. This correction does not claim delivery or change #1784's Review state.
