import fetch from "node-fetch";
import express from "express";
import dotenv from "dotenv";

dotenv.config();
const app = express();

app.use(express.json({ limit: "50mb" }));// limit added to avoid payload too large error
app.use(express.urlencoded({ limit: "50mb", extended: true }));

const port = process.env.PORT || 3000;
const modelMap = {
    "gpt-3.5-turbo": "gpt-3.5-turbo-0125",
    "gpt-3.5-turbo-16k": "gpt-3.5-turbo-16k-0613",
    "gpt-4": "gpt-4-0613",
    "gpt-4-turbo-preview": "gpt-4-0125-preview",
    "gpt-4-32k": "gpt-4-32k-0613",
    "gpt-4-vision-preview": "gpt-4-1106-vision-preview",
};

// 一个用于记录请求信息的中间件
app.use((req, res, next) => {
    console.log(`Request: ${req.method} ${req.url}`);
    next();
});

app.all("*", async (req, res) => {
    try{
        let reqPath = req.path;
        // 去除多余的斜杠
        reqPath = reqPath.replace(/\/{2,}/g, "/");
        reqPath = reqPath.replace(/\/$/, "");
        // 去除开头的斜杠
        reqPath = reqPath.replace(/^\//, "");

        let pathArr = reqPath.split("/");
        let fackPathCount = 0;
        // console.log(pathArr)

        let host = ''
        if (pathArr[0] === 'v1') {
            return standerdError(res, message = 'host not found', type = 'config error', param = null, code = 400)
        } else {
            host = pathArr[0]
            fackPathCount++
        }
        // console.log(`host: ${host}`)

        let ssl = false
        if (pathArr[1] === 'ssl') {
            ssl = true
            fackPathCount++
        }else if(pathArr[1] === 'no-ssl'){
            ssl = false
            fackPathCount++
        }
        let realPath = pathArr.slice(fackPathCount).join("/");

        let realHost = host.replace(/-/g, ".");

        let fetchUrl = "";
        if (ssl) {
            fetchUrl = `https://${realHost}/${realPath}`;
        } else {
            fetchUrl = `http://${realHost}/${realPath}`;
        }

        let model = req?.body?.model


        const response = await fetch(fetchUrl, {
            method: req.method,
            headers: {
                "Content-Type": "application/json",
                "Authorization": req.headers.authorization,
            },
            body: typeof req.body === "object" ? JSON.stringify(req.body) : '{}',
        });

        if (response.ok) {
            if (req.body?.stream) {
                // 如果请求中包含stream字段，直接返回response
                let resHeaders = response.headers.raw()
                res.writeHead(response.status, resHeaders);
                streamModifier(response.body, res, model);
            }
        } else {
            res.writeHead(response.status, response.headers.raw());
            standerdError(res, message = 'fetch error', type = 'fetch error', param = null, code = 500)
        }
    } catch (error) {
        console.log(`在处理请求时捕捉到一个错误: ${error}`);
        return standerdError(
            res,
            500,
            500,
            "internal server error",
            "An error occurred while processing your request"
        );
    }
})

async function streamModifier(resBody, res, model) {
    try {
        let buffer = "";
        // 'data'事件处理器：当接收到新的数据块时触发
        resBody.on("data", (data) => {

            // 如果data是空的，就直接返回不做处理
            if (!data) return;

            // 将接收到的数据块转换为字符串形式
            let content = data.toString();

            // 将转换后的数据添加到buffer中，用于积累完整的数据
            buffer += content;

            // 查找buffer中最后一个出现的双换行符的位置，这用于区分完整的消息和不完整的消息
            let lastNewlineIndex = buffer.lastIndexOf("\n\n");

            // 将buffer中到最后一个双换行符之前的部分（如果有的话）视为完整数据
            let completeData = buffer.substring(0, lastNewlineIndex);

            // 将最后一个双换行符之后的部分保留为不完整的数据，等待更多的数据到来
            let incompleteData = buffer.substring(lastNewlineIndex + 2);

            // 更新buffer，只保存不完整的数据部分
            buffer = incompleteData;

            // 将完整的数据部分按双换行符分割，得到完整的消息行
            let lines = completeData.split("\n\n");

            // 遍历所有完整的消息行
            lines.forEach((line) => {
                // 对每一行使用makeLine函数进行处理，可能是格式化、过滤等
                let newLine = makeLine(line, model);

                // 如果处理后的行是有效的，则写入响应流
                if (newLine) {
                    res.write(newLine);
                }
            });
        });

        resBody.on("end", () => {
            if (buffer) {
                let newLine = makeLine(buffer, model);
                res.write(newLine);
            }
            res.end();
        });
    } catch (error) {
        logger.error(`在streamModifier函数中捕捉到一个错误: ${error}`);
        return standerdError(
            res,
            500,
            500,
            "internal server error",
            "An error occurred while processing your request"
        );
    }
}

function makeLine(line, model) {
    if (line === "data: [DONE]") {
        return "data: [DONE]\n\n";
    } else if (line.startsWith("data: ")) {
        try {
            // 获取json数据
            let json = JSON.parse(line.slice(6));
            //   如果json数据中包含content_filter_results字段，则将该字段删除
            if (json?.content_filter_results) {
                delete json.content_filter_results;
            }
            if (json?.choices?.[0]?.content_filter_results) {
                delete json.choices[0].content_filter_results;
            }
            json.model = modelMap[model] || model;
            return `data: ${JSON.stringify(json)}\n\n`;
        } catch (error) {
            logger.error(`在构造数据时遇到错误: ${error}，发生错误的数据: ${line}`);
        }
    }
    return "";
}

function standerdError(res, message, type, param, code) {
    res.json({
        error:{
            message: message,
            type: type,
            param: param,
            code: code
        }
    });
    res.end();
    return;
}

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});