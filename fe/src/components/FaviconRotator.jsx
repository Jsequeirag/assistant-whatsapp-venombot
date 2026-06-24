import { useEffect } from "react";

export default function FaviconRotator({
  icons = ["/favicon.png"],
  interval = 3000,
}) {
  useEffect(() => {
    if (icons.length <= 1) return;

    let index = 0;
    const update = () => {
      let link = document.querySelector("link[rel*='icon']");
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
      }
      link.href = icons[index] + "?v=" + Date.now();
      index = (index + 1) % icons.length;
    };

    update();
    const id = setInterval(update, interval);
    return () => clearInterval(id);
  }, [icons, interval]);

  return null;
}
