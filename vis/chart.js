import { init, registerIndicator, registerOverlay } from 'https://cdn.skypack.dev/klinecharts'

function getQueryParam(param) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(param);
}

function getTimeDifferenceAsString(timestamp1, timestamp2) {
  // Calculate the difference in milliseconds
  let difference = Math.abs(timestamp1 - timestamp2);

  // Convert milliseconds to days, hours, minutes
  let days = Math.floor(difference / (1000 * 60 * 60 * 24));
  difference -= days * (1000 * 60 * 60 * 24);

  let hours = Math.floor(difference / (1000 * 60 * 60));
  difference -= hours * (1000 * 60 * 60);

  let minutes = Math.floor(difference / (1000 * 60));

  // Construct the readable string
  let result = ""
  if (days > 0) {
      result += days + "d "
  }
  if (hours > 0) {
      result += hours + "hr "
  }
  if (minutes > 0) {
      result += minutes + "min"
  }

  return result;
}

async function fetchPrice(symbol) {
  return fetch(`/price/${symbol}/prices.json`)
    .then(response => {
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      return response.json(); // Parse the JSON response
    })
    .then(data => {
      const prices = Object.entries(data).map(([timestamp, entry]) => ({
        close: entry.close,
        high: entry.high,
        low: entry.low,
        open: entry.open,
        timestamp: new Date(timestamp).getTime()
      }));
      return prices;
    });
}

async function fetchTransaction(strategy, symbol) {
  return fetch(`/results/${strategy}/${symbol}/result.json`)
    .then(response => {
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      return response.json(); // Parse the JSON response
    })
    .then(data => {
      const transactions = data.slice(0,-1).map(entry => ({
        timestamp: entry.timestamp,
        mode: entry.transaction.mode,
        price: entry.transaction.price,
        amount: entry.transaction.amount
      }));
      return transactions;
    })
}

async function fetchData(strategy, symbol) {
  return fetch(`/results/${strategy}/${symbol}/profit_flow.json`)
      .then(response => {
          if (!response.ok) {
              throw new Error('Network response was not ok');
          }
          return response.json(); // Parse the JSON response
      })
      .then(data => {
        const profits = data.map(entry => ({
            close: entry.profit,
            high: entry.price,
            low: 100 * entry.profit / 182,
            open: entry.average_price,
            timestamp: new Date(entry.time).getTime()
        }));
        return profits;
      });
}

const chart = init('k-line-chart')

registerIndicator({
  name: 'ZeroLine',
  figures: [
    {
      key: 'zeroLine',
      type: 'line',
      styles: ()=>({
        style: 'dashed', color: '#FF4500', dashedValue: [8, 4], size: 1
      })
    }
  ],
  calc: (kLineDataList) => {
    return kLineDataList.map(kLineData => ({ zeroLine: 0}))
  },
  createTooltipDataSource: () => ({name: ''})
})

const symbol = getQueryParam('symbol');
const strategy = getQueryParam('strategy');

Promise.all([fetchData(strategy, symbol), fetchTransaction(strategy, symbol), fetchPrice(symbol)])
  .then(([profitList, transactionList, priceList]) => {
    const firstIdx = priceList.findIndex(item => item.timestamp === profitList[0].timestamp)
    priceList = priceList.slice(firstIdx, firstIdx + profitList.length)
    registerOverlay({
      name: 'sampleRect',
      totalStep: 3,
      needDefaultPointFigure: true,
      needDefaultXAxisFigure: true,
      needDefaultYAxisFigure: true,
      createPointFigures: ({ coordinates, bounding, precision, overlay, thousandsSeparator, decimalFoldThreshold }) => {
        if (coordinates.length === 2) {
          const startValue = (overlay.points)[0].value
          const endValue = (overlay.points)[1].value

          const startTime = (overlay.points)[0].timestamp
          const endTime = (overlay.points)[1].timestamp

          const width = coordinates[1].x - coordinates[0].x
          const height = coordinates[1].y - coordinates[0].y
          return [
            {
              key: 'sampleCircle',
              type: 'rect',
              attrs: {
                x: coordinates[0].x,
                y: coordinates[0].y,
                width: width,
                height: height
              },
              styles: {
                style: 'stroke_fill'
              }
            },
            {
              type: 'text',
              ignoreEvent: true,
              attrs: {
                x: coordinates[0].x,
                y: coordinates[0].y + 10,
                text: ((endValue - startValue > 0)? '+' : '') + (endValue - startValue).toFixed(2) + ' (' + ((endValue - startValue > 0)? '+' : '') + (100 * (endValue - startValue) / startValue).toFixed(2) + '%)'  + ', ' + getTimeDifferenceAsString(endTime, startTime)
              }
            }
          ]
        }
        return []
      }

    })

    registerIndicator({
      name: 'priceTransaction',
      figures: [
        {key: 'transaction'}
      ],
      calc: (kLineDataList) => {
        const results = []

        kLineDataList.forEach(kLineData => {
          let transaction = transactionList.find(tr => tr.timestamp * 1000 === kLineData.timestamp)
          if (transaction) {
            results.push({transaction: {
              mode: transaction.mode,
              buyPrice: transaction.price,
              amount: transaction.amount,
              currentPrice: kLineData.close,
            }})
          }
          else {
            results.push({transaction: "None"})
          }
        })
        return results
      },
      draw: ({
        ctx,
        barSpace,
        visibleRange,
        indicator,
        xAxis,
        yAxis
      }) => {
        const { from, to } = visibleRange
        const result = indicator.result
        for (let i = from; i < to; i++) {
          const data = result[i]
          if (data.transaction !== "None") {
            const x = xAxis.convertToPixel(i)
            const y = yAxis.convertToPixel(data.transaction.currentPrice)

            ctx.beginPath();
            ctx.arc(x, y, 4, 0, 2 * Math.PI, false);
            ctx.fillStyle = data.transaction.mode === "BUY"? "#FF007F" : "#90EE90"
            ctx.fill();
          }
        }
      },
      createTooltipDataSource: () => ({name: ''})
    })

    registerIndicator({
      name: 'profitTransaction',
      figures: [
        {key: 'transaction'}
      ],
      calc: () => {
        const results = []

        profitList.forEach(kLineData => {
          let transaction = transactionList.find(tr => tr.timestamp * 1000 === kLineData.timestamp)
          if (transaction) {
            results.push({transaction: {
              mode: transaction.mode,
              buyPrice: transaction.price,
              amount: transaction.amount,
              currentPrice: kLineData.close,
            }})
          }
          else {
            results.push({transaction: "None"})
          }
        })
        return results
      },
      draw: ({
        ctx,
        barSpace,
        visibleRange,
        indicator,
        xAxis,
        yAxis
      }) => {
        const { from, to } = visibleRange
        const result = indicator.result
        for (let i = from; i < to; i++) {
          const data = result[i]
          if (data.transaction !== "None") {
            const x = xAxis.convertToPixel(i)
            const y = yAxis.convertToPixel(data.transaction.currentPrice)

            ctx.beginPath();
            ctx.arc(x, y, 4, 0, 2 * Math.PI, false);
            ctx.fillStyle = data.transaction.mode === "BUY"? "#FF007F" : "#90EE90"
            ctx.fill();
          }
        }
      },
      createTooltipDataSource: () => ({name: ''})
    })


    registerIndicator({
      name: 'Profit',
      figures: [
        { key: 'profit', title: 'Profit: ', type: 'line' }
      ],
      calc: () => {
        return profitList.map(entry => ({profit: entry.close}))
      },
      createTooltipDataSource: ({crosshair}) => {
        return {
          name: '',
          values: [
            {
              title: {
                text: 'Profit: ',
                color: 'blue'
              },
              value: {
                text: profitList[crosshair.dataIndex].close.toFixed(4),
                color: 'blue'
              }
            },
            {
              title: {
                text: 'ROI: ',
                color: 'red'
              },
              value: {
                text: (100 * profitList[crosshair.dataIndex].close / 600).toFixed(2) + '%',
                color: 'red'
              }
            }
          ]
        }
      }

    })

    container = document.getElementById('container')

    let clickTime = 0;
    chart.applyNewData(priceList)
    // chart.applyNewData(profitList)
    chart.setPriceVolumePrecision(4, 4)

    chart.createIndicator(
      'Profit',
      false,
      {
          id: 'profitPane',
          height: container.offsetHeight / 2
      }
    )
    chart.createIndicator('priceTransaction', true, {id: 'candle_pane'})
    chart.createIndicator('profitTransaction', true, {id: 'profitPane'})

    const buttonContainer = document.createElement('div')
    buttonContainer.classList.add('button-container')

    const setbutton = document.createElement('button')
    setbutton.innerText = 'Remove Zero Line'
    chart.createIndicator('ZeroLine', true, {id: 'profitPane'})
    setbutton.addEventListener('click', function(){
      if (clickTime % 2 == 1){
        setbutton.innerText = 'Remove Zero Line'
        chart.createIndicator('ZeroLine', true, {id: 'profitPane'})
      }
      else {
        setbutton.innerText = 'Set Zero Line'
        chart.removeIndicator('profitPane', 'ZeroLine')
      }
      clickTime ++
    })

    const priceButton = document.createElement('button')
    priceButton.innerText = 'Draw Price Line'
    priceButton.addEventListener('click', () => {chart.createOverlay('simpleTag'); })

    const febbuttoon = document.createElement('button')
    febbuttoon.innerText = 'Draw Fib. Line'
    febbuttoon.addEventListener('click', () => {chart.createOverlay('sampleRect'); })

    buttonContainer.appendChild(setbutton)
    buttonContainer.appendChild(priceButton)
    buttonContainer.appendChild(febbuttoon)
    container.appendChild(buttonContainer)

    chart.setStyles({
      candle: {
        type: 'area',
        tooltip: {
          showRule: 'follow_cross',
          showType: 'rect',
          custom: [
            { title: 'Time: ', value: '{time}' },
            { title: 'Open: ', value: '{open}' },
            { title: 'High: ', value: '{high}' },
            { title: 'Low: ', value: '{low}' },
            { title: 'Close: ', value: '{close}' },
            { title: '', value: ''}
          ],
          rect: {
            position: 'pointer',
            offsetLeft: 50,
            offsetTop: 20,
            offsetRight: 50,
            offsetBottom: 20,
          }
        }
      },
      indicator: {
        lines: [
          {
            size: 2,
            color: 'blue'
          },
          {
            style: 'dashed',
            smooth: false,
            dashedValue: [8, 4],
            size: 1,
            color: '#FF4500'
          }
        ],
        tooltip: {
          showRule: 'follow_cross',
          showType: 'rect'
        }
      }
    })
  })
