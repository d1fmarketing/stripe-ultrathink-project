import { createExtension } from "@stripe/ui-extension-sdk";
import Dashboard from "./views/Dashboard";
import DisputeDetail from "./views/DisputeDetail";

// Register the extension and all views
const extension = createExtension({
  views: [
    {
      viewport: "stripe.dashboard.home.overview",
      component: Dashboard
    },
    {
      viewport: "stripe.dashboard.dispute.detail", 
      component: DisputeDetail
    }
  ]
});

export default extension;