import ReactECharts from 'echarts-for-react'; 

const GGChart = ({ data, height = 400 }) => {
    const options = {
        title: { text: 'G-G Diagram', left: 'center' },
        grid: { left: '10%', right: '10%', top: '15%', bottom: '15%' },
        tooltip: {
            formatter: (params) => {
                return `Lat: ${params.value[0].toFixed(2)} G<br/>Long: ${params.value[1].toFixed(2)} G`;
            }
        },
        xAxis: {
            type: 'value',
            name: 'Lateral G',
            nameLocation: 'middle',
            nameGap: 25,
            min: -2.5, max: 2.5, // Fixed scale for realistic G-G shape
            axisLabel: { formatter: '{value} G' },
            splitLine: { show: true }
        },
        yAxis: {
            type: 'value',
            name: 'Longitudinal G',
            nameLocation: 'middle',
            nameGap: 30,
            min: -2.5, max: 2.5, // Fixed scale
            axisLabel: { formatter: '{value} G' },
            splitLine: { show: true }
        },
        series: [{
            symbolSize: 4,
            data: data,
            type: 'scatter',
            itemStyle: { color: '#8884d8', opacity: 0.6 }
        }]
    };

    return <ReactECharts option={options} style={{ height: height, width: "100%" }} />;
};


export default GGChart;