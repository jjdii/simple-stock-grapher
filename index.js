// create and print 2d canvas element to DOM
var canvas = document.createElement("canvas");
const w = 600;
const h = 240;
canvas.setAttribute("height", h);
canvas.setAttribute("width", w);
document.getElementById("graph").appendChild(canvas);
var ctx = canvas.getContext("2d");

// paint background, grid lines and outer border onto canvas
const paintGrid = (lines) => {
  const wLines = Math.round(w / lines);
  const hLines = Math.round(h / lines);
  // fill bg
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, w, h);
 
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#efefef";
  // draw horizontal grid lines based on canvas height
  ctx.beginPath();
  for (var i = 0; i <= wLines; i++) {
    ctx.moveTo(0, Math.round(i * (h / hLines)));
    ctx.lineTo(w, Math.round(i * (h / hLines)));  
  }
  ctx.stroke();
  // draw vertical grid lines based on canvas width
  ctx.beginPath();
  for (var i = 0; i <= wLines; i++) {
    ctx.moveTo(Math.round(i * (w / wLines)), 0);
    ctx.lineTo(Math.round(i * (w / wLines)), h);  
  }
  ctx.stroke();
  
  // draw outer border
  ctx.strokeStyle = "black";
  ctx.strokeRect(0, 0, w, h);
};

// request from alpha vantage stock api and render the json data
const renderData = (stock, interval) => {
  // use interval api parameter if time series is intraday
  const useInterval = R.not(isNaN(Number(interval.substr(0, 1))));
  const intervalParam = (useInterval) ? `&interval=${interval}` : "";
  const intervalStr = (useInterval) ? "INTRADAY" : interval.toUpperCase();
  // don't use outputsize api parameter if weekly or monthly time series
  const useOutputSize = interval.toLowerCase() === "weekly" || interval.toLowerCase() === "monthly";
  const outputSize = (useOutputSize) ? "" : "&outputsize=full";
  // constructed api call to alpha vantage
  const apiUrl = `https://www.alphavantage.co/query?function=TIME_SERIES_${intervalStr}&symbol=${stock + intervalParam + outputSize}&apikey=SXQX0NBK6AAV7ZAR`;
  
  // print default header text to DOM
  const delimiter = "<span class='unbold'>&nbsp;&ndash;&nbsp;</span>";
  document.getElementById("header").innerHTML = 
    `<h2>
      ${stock} 
      ${delimiter} 
      00.0000 
      ${delimiter} 
      <span class='smaller'>Last Updated @ 00:00:00</span>
    </h2>`;
  
  // show loader
  document.getElementById("loader").style.display = "block";
  document.getElementById("loader").style.opacity = 1; // seems to be necessary

  $.getJSON(apiUrl,
    data => {
      // adjust json parsing for varying api calls and expected returns
      const timeSeries = (useOutputSize) ? 
        `${interval} Time Series` :
        `Time Series (${interval})`;
      // get the latest close price to display in the header
      const latestRefresh = data["Meta Data"]["3. Last Refreshed"];
      const latestCloseNum = (useInterval) ? 
        data[timeSeries][latestRefresh]["4. close"] : 
        data[timeSeries][latestRefresh.split(" ")[0]]["4. close"];
      // get the last update time for the header
      const latestCloseTime = latestRefresh.split(" ")[1] || "16:00:00";
      
      // convert data to a graph-friendly object array
      const dataToObj = data => {
        var items = [];
        var i = 1;
        $.each(data[timeSeries], (key, val) => {
          items.push(
            {open: val["1. open"], high: val["2. high"], low: val["3. low"], 
             close: val["4. close"], volume: val["5. volume"], order: i++, key}
          );
        });
        return items;
      };    

      // convert data to readable HTML format
      const dataToHTML = data =>
        //`<p>#${data.order + 1} ${delimiter}
        `<p>
          #${data.order} ${delimiter}
          ${data.key} ${delimiter}
          Open: ${data.open} ${delimiter} 
          High: ${data.high} ${delimiter} 
          Low: ${data.low} ${delimiter} 
          Close: ${data.close} ${delimiter} 
          Volume: ${data.volume}
        </p>`;

      const fullItems = dataToObj(data);
      // trim an object to the desired max length
      const trimObj = (max, obj) => (obj.length > max) ? R.dropLast(obj.length - max, obj) : obj; 
      // trim the array to 200 data points max
      const items = trimObj(200, fullItems);

      // get the highest and lowest values to be graphed
      const lowestLow = R.pipe(
        R.sort((a, b) => a.low - b.low),
        R.head(),
        R.prop('low')
      )(items);
      const highestHigh = R.pipe(
        R.sort((a, b) => b.high - a.high),
        R.head(),
        R.prop('high')
      )(items);
      const numRange = highestHigh - lowestLow;

      // print header text to DOM
      document.getElementById("header").innerHTML = 
        `<h2>
          ${data["Meta Data"]["2. Symbol"]} ${delimiter} 
          ${latestCloseNum} ${delimiter} 
          <span style='font-size:95%;'>Last Updated @ ${latestCloseTime}</span>
        </h2>`;

      // print list of historical prices to DOM
      document.getElementById("content").innerHTML = 
        `<h2 class='unbold divider'>
          ${data["Meta Data"]["1. Information"]}
        </h2>
        <button id='show-data'>Show Raw Data</button>
        <div id='raw-data'>
          ${R.map(dataToHTML, items).join("")}
        </div>`;
      // add functionality to data button
      document.getElementById("show-data").addEventListener("click", function() {
        document.getElementById("show-data").style.display = "none";
        document.getElementById("raw-data").style.display = "block";
      });
          
      // translate y values from 0-to-h to numRange
      const translateY = y => h - ((y * (h / numRange)) - lowestLow * (h / numRange));
      // translate x values relative to w and order in the array
      const translateX = item => (items.length - item.order) * Math.round(w / items.length)
      // draws a box from the high price down to the close price
      const paintHighItem = (size, item) => {
        ctx.fillStyle = "green";
        ctx.fillRect(translateX(item) - size / 2, translateY(item.high), 
                     size, translateY(item.close) - translateY(item.high));
      };
      // draws a box from the close price down to the low price
      const paintLowItem = (size, item) => {
        ctx.fillStyle = "red";
        ctx.fillRect(translateX(item) - size / 2, translateY(item.close), 
                     size, translateY(item.low) - translateY(item.close));
      };
      // curry the candle paint functions
      const curryPaintHigh = R.curry(paintHighItem);
      const curryPaintLow = R.curry(paintLowItem);
      // draw a point on the line for the given close price
      const paintCloseItem = item => ctx.lineTo(translateX(item), translateY(item.close));
    
      // hide the loader
      document.getElementById("loader").style.display = "none";

      // draw all low & high candles from data to the canvas with given size (2px)
      R.pipe(
        R.forEach(curryPaintLow(2)),
        R.forEach(curryPaintHigh(2))
      )(items);

      // draw a line connecting all of the close price points
      ctx.beginPath();
      ctx.lineWidth = 1;
      ctx.strokeStyle = "black";
      ctx.moveTo(w, translateY(items[0].close));
      R.forEach(paintCloseItem, items);
      ctx.stroke();

      // redraw the outer border
      ctx.strokeStyle = "black";
      ctx.strokeRect(0, 0, w, h);
    }
  )
  .done(() => console.log("success"))
  .fail(() => console.log("error"));
};

// runtime
paintGrid(15);
renderData(document.querySelector("input").value, "5min"); // valid interval arguments: 1min, 5min, Daily, Weekly, Monthly

document.getElementById("get-symbol").addEventListener("click", function() {
  paintGrid(15);
  renderData(document.querySelector("input").value, 
             document.querySelector("select option:checked").value);
});